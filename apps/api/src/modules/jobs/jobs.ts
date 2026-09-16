/**
 * Scheduled job functions (TRD §17, D1/D3). Thin wrappers over the already-
 * tested service/reconciliation functions, adding logging + alerting. The
 * BullMQ transport (queues.ts) just calls these on a cron.
 */
import { prisma } from '@hq/database';
import { autoComplete, noShowSweep } from '../bookings/service.js';
import { reconcile } from '../payments/ledger/reconciliation.js';
import { runCommissionSweep, type Deps } from '../payments/service.js';
import { resumePaymentOperation, reconcileStuckWithdrawals } from '../payments/recovery.js';
import { noopGateway, type RealtimeGateway } from '../../realtime/gateway.js';
import { authorizedChatMediaKey } from '../storage/chat-media.js';
import { type StoragePort } from '../storage/storage.js';
import { claimOperation } from '../payments/ledger/operations.js';
import { writeAudit, verifyAuditChain } from '../audit.js';
import { env } from '../../env.js';
import { reconcileCheckouts } from '../payments/checkout.js';

const DAY_MS = 86_400_000;

function log(message: string): void {
   
  console.log(`[job] ${message}`);
}

export async function jobAutoComplete(realtime: RealtimeGateway = noopGateway): Promise<void> {
  const r = await autoComplete(undefined, undefined, realtime);
  if (r.completed.length) log(`auto-completed ${String(r.completed.length)} booking(s)`);
}

export async function jobNoShow(deps: Deps, realtime: RealtimeGateway = noopGateway): Promise<void> {
  const r = await noShowSweep(deps, undefined, undefined, realtime);
  if (r.noShows.length) log(`flagged ${String(r.noShows.length)} no-show(s)`);
}

export async function jobReconcile(deps: Deps, realtime: RealtimeGateway = noopGateway): Promise<void> {
  const r = await reconcile(prisma, deps.paystack);
  if (r.ok) {
    log('reconciliation ok');
    return;
  }
  log(`⚠ RECONCILIATION ALARM drift=${String(r.driftKobo)} stale=${String(r.staleHeldBookingIds.length)}`);
  // Push the alarm to the admin operational feed so drift gets investigated and
  // stale HELD allocations are actioned before Paystack's 90-day Manual Payouts
  // cutoff (§10/§17) — previously this was log-only and nothing consumed it.
  realtime.emitToAdmins('recon:alarm', {
    driftKobo: r.driftKobo,
    staleHeldBookingIds: r.staleHeldBookingIds,
    at: new Date().toISOString(),
  });
  if (r.staleHeldBookingIds.length > 0) {
    await writeAudit({
      actorId: null,
      action: 'reconciliation.stale_held',
      target: 'system',
      metadata: {
        count: r.staleHeldBookingIds.length,
        bookingIds: r.staleHeldBookingIds,
        driftKobo: r.driftKobo,
      },
    });
  }
}

export async function jobCommissionSweep(deps: Deps): Promise<void> {
  if (!env.PAYSTACK_OPERATING_RECIPIENT) {
    log('commission sweep skipped: PAYSTACK_OPERATING_RECIPIENT not set');
    return;
  }
  const r = await runCommissionSweep(deps, { operatingRecipientCode: env.PAYSTACK_OPERATING_RECIPIENT });
  log(`commission swept: ${String(r.swept)} kobo`);
}

/**
 * Resume durable payment operations after a crash and finalise withdrawals whose
 * transfer webhook was lost (TRD §10/§17). Replaces the previous log-only retry:
 * it re-drives PENDING/PROVIDER_OK operations and reconciles stuck withdrawals
 * against Paystack's authoritative transfer status.
 */
export async function jobResumePaymentOps(
  deps: Deps,
  realtime: RealtimeGateway = noopGateway,
): Promise<void> {
  // Backfill approvals created by the former EXECUTED-before-intent sequence.
  // Page by immutable ID so existing/blocked records cannot hide later orphans.
  let after: string | undefined;
  for (;;) {
    const approvals = await deps.prisma.approval.findMany({
      where: { status: { in: ['APPROVED', 'EXECUTED'] }, checkerId: { not: null } },
      orderBy: { id: 'asc' },
      take: 100,
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
    });
    for (const approval of approvals) {
      const dedupeKey = `APPROVAL_EXECUTE:${approval.id}`;
      if (!(await deps.prisma.paymentOperation.findUnique({ where: { dedupeKey } }))) {
        await claimOperation(deps.prisma, {
          kind: 'APPROVAL_EXECUTE',
          dedupeKey,
          payload: { approvalId: approval.id },
        });
      }
    }
    if (approvals.length < 100) break;
    after = approvals.at(-1)?.id;
  }
  const cutoff = new Date(Date.now() - 5 * 60_000); // let the synchronous path finish first
  const ops = await deps.prisma.paymentOperation.findMany({
    where: { status: { in: ['PENDING', 'PROVIDER_OK'] }, updatedAt: { lt: cutoff } },
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    take: 100,
  });
  let recorded = 0;
  let failed = 0;
  let stillPending = 0;
  for (const op of ops) {
    try {
      const r = await resumePaymentOperation(deps, op, realtime);
      if (r === 'recorded') recorded += 1;
      else if (r === 'failed') failed += 1;
      else stillPending += 1;
    } catch (e) {
      stillPending += 1;
      log(`resume op ${op.id} (${op.kind}) failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const wd = await reconcileStuckWithdrawals(deps);
  if (recorded || failed || stillPending || wd.completed || wd.failed) {
    log(
      `payment-op resume: ${String(recorded)} recorded, ${String(failed)} failed, ${String(stillPending)} pending; ` +
        `withdrawals reconciled +${String(wd.completed)}/-${String(wd.failed)} (${String(wd.pending)} pending)`,
    );
  }
}

/** Recover checkouts and expire only reservations supported by conclusive unpaid evidence. */
export async function jobCheckouts(deps: Deps): Promise<void> {
  await reconcileCheckouts(deps);
}

/**
 * NDPR retention purge (TRD §14). Removes transient PII past its window —
 * consumed/expired OTP codes and stale device tokens. Never touches financial
 * or ledger rows (those keep the 7-year obligation).
 */
export async function jobRetentionPurge(storage?: StoragePort): Promise<void> {
  const now = Date.now();
  const otpCutoff = new Date(now - env.RETENTION_OTP_DAYS * DAY_MS);
  const deviceCutoff = new Date(now - env.RETENTION_DEVICE_TOKEN_DAYS * DAY_MS);

  const otp = await prisma.verificationCode.deleteMany({
    where: {
      createdAt: { lt: otpCutoff },
      OR: [{ consumedAt: { not: null } }, { expiresAt: { lt: new Date(now) } }],
    },
  });
  const devices = await prisma.deviceToken.deleteMany({ where: { lastSeenAt: { lt: deviceCutoff } } });
  // Refresh-token denylist: a revoked jti only needs to outlive the token it
  // blocks; once expired the JWT is rejected on its own, so the row is dead weight.
  const revokedTokens = await prisma.revokedToken.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });

  // KYC raw documents (TRD §14): delete the ID doc + selfie objects 90 days after
  // VERIFIED (APPROVED) / 30 days after REJECTED, leaving only the pass/fail flag
  // and reviewer/audit record. Purged rows are tombstoned with '' so they aren't
  // reprocessed; the ledger/KYC *trail* (7-year) lives in other tables, untouched.
  const kycVerifiedCutoff = new Date(now - env.RETENTION_KYC_VERIFIED_DAYS * DAY_MS);
  const kycRejectedCutoff = new Date(now - env.RETENTION_KYC_REJECTED_DAYS * DAY_MS);
  const kycRows = await prisma.usherVerification.findMany({
    where: {
      idDocumentUrl: { not: '' },
      OR: [
        { status: 'APPROVED', reviewedAt: { lt: kycVerifiedCutoff } },
        { status: 'REJECTED', reviewedAt: { lt: kycRejectedCutoff } },
      ],
    },
    select: { id: true, idDocumentUrl: true, selfieUrl: true },
  });
  for (const v of kycRows) {
    if (storage) {
      await Promise.allSettled(
        [v.idDocumentUrl, v.selfieUrl].filter((k): k is string => Boolean(k)).map((k) => storage.deleteObject(k)),
      );
    }
    await prisma.usherVerification.update({ where: { id: v.id }, data: { idDocumentUrl: '', selfieUrl: '' } });
  }

  // Chat/media (TRD §14): delete messages (and their media objects) 180 days after
  // the booking's dispute window closes. Gate on the event date plus a safety
  // margin (≥ end + 72h dispute window) so nothing is deleted before the window.
  const chatCutoff = new Date(now - (env.RETENTION_CHAT_DAYS + 4) * DAY_MS);
  const staleConvos = await prisma.conversation.findMany({
    where: { booking: { event: { eventDate: { lt: chatCutoff } } } },
    select: { id: true },
  });
  const convoIds = staleConvos.map((c) => c.id);
  let chatDeleted = 0;
  if (convoIds.length) {
    if (storage) {
      const media = await prisma.message.findMany({
        where: { conversationId: { in: convoIds }, contentType: { in: ['IMAGE', 'VOICE'] } },
        select: {
          content: true, contentType: true, senderId: true,
          conversation: { select: {
            bookingId: true, clientId: true, usherId: true,
            booking: { select: {
              usherId: true, usher: { select: { userId: true } },
              event: { select: { clientId: true, client: { select: { userId: true } } } },
            } },
          } },
        },
      });
      const authorizedKeys: string[] = [];
      for (const message of media) {
        const { conversation } = message;
        const { booking } = conversation;
        if (conversation.clientId !== booking.event.clientId || conversation.usherId !== booking.usherId) continue;
        const key = authorizedChatMediaKey(message, {
          bookingId: conversation.bookingId,
          clientUserId: booking.event.client.userId,
          usherUserId: booking.usher.userId,
        });
        if (key) authorizedKeys.push(key);
      }
      const skipped = media.length - authorizedKeys.length;
      if (skipped) log(`retention skipped ${String(skipped)} unauthorized chat media reference(s)`);
      await Promise.allSettled([...new Set(authorizedKeys)].map((key) => storage.deleteObject(key)));
    }
    chatDeleted = (await prisma.message.deleteMany({ where: { conversationId: { in: convoIds } } })).count;
  }

  if (otp.count || devices.count || kycRows.length || chatDeleted) {
    log(
      `retention purge: ${String(otp.count)} otp, ${String(devices.count)} device token(s), ` +
        `${String(kycRows.length)} kyc doc set(s), ${String(chatDeleted)} message(s)`,
    );
  }
  await writeAudit({
    actorId: null,
    action: 'retention.purge',
    target: 'system',
    metadata: {
      verificationCodes: otp.count,
      deviceTokens: devices.count,
      revokedTokens: revokedTokens.count,
      kycDocuments: kycRows.length,
      messages: chatDeleted,
    },
  });
}

/** Recompute the audit hash chain and alarm loudly on any break (TRD §14). */
export async function jobAuditVerify(): Promise<void> {
  const r = await verifyAuditChain();
  if (r.ok) {
    log(`audit chain ok: ${String(r.checked)} chained, ${String(r.legacy)} legacy`);
    return;
  }
  log(`⚠ AUDIT CHAIN BROKEN at seq=${r.brokenAt?.seq ?? '?'} (${r.brokenAt?.reason ?? 'unknown'})`);
}
