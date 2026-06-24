/**
 * Scheduled job functions (TRD §17, D1/D3). Thin wrappers over the already-
 * tested service/reconciliation functions, adding logging + alerting. The
 * BullMQ transport (queues.ts) just calls these on a cron.
 */
import { prisma } from '@hq/database';
import { autoComplete, noShowSweep } from '../bookings/service.js';
import { reconcile } from '../payments/ledger/reconciliation.js';
import { runCommissionSweep, type Deps } from '../payments/service.js';
import { noopGateway, type RealtimeGateway } from '../../realtime/gateway.js';
import { writeAudit, verifyAuditChain } from '../audit.js';
import { env } from '../../env.js';

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

export async function jobReconcile(deps: Deps): Promise<void> {
  const r = await reconcile(prisma, deps.paystack);
  if (!r.ok) {
    log(`⚠ RECONCILIATION ALARM drift=${String(r.driftKobo)} stale=${String(r.staleHeldBookingIds.length)}`);
  } else {
    log('reconciliation ok');
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

/** Surface withdrawals stuck in PROCESSING (no transfer webhook) for ops follow-up. */
export async function jobTransferRetry(): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 60_000);
  const stuck = await prisma.withdrawal.findMany({
    where: { status: 'PROCESSING', updatedAt: { lt: cutoff } },
    select: { id: true },
  });
  if (stuck.length) log(`⚠ ${String(stuck.length)} withdrawal(s) stuck in PROCESSING >30m`);
}

/**
 * NDPR retention purge (TRD §14). Removes transient PII past its window —
 * consumed/expired OTP codes and stale device tokens. Never touches financial
 * or ledger rows (those keep the 7-year obligation).
 */
export async function jobRetentionPurge(): Promise<void> {
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

  if (otp.count || devices.count) {
    log(`retention purge: ${String(otp.count)} otp code(s), ${String(devices.count)} device token(s)`);
  }
  await writeAudit({
    actorId: null,
    action: 'retention.purge',
    target: 'system',
    metadata: { verificationCodes: otp.count, deviceTokens: devices.count },
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
