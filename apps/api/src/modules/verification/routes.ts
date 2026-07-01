/**
 * Biometric KYC (Dojah). Two surfaces:
 *  - POST /api/me/verification/kyc/start — the usher's device asks for widget +
 *    reference params; we persist a PENDING biometric verification keyed by the
 *    reference id and cap resubmits.
 *  - POST /webhooks/dojah — Dojah's `kyc.widget` server-to-server callback. We
 *    parse + (optionally) verify it, reconcile by reference id, and set the
 *    usher VERIFIED / REJECTED / still-PENDING. The device's onClose is never
 *    trusted; this webhook is authoritative.
 *
 * NDPR: NIN/BVN are sensitive PII — they live in dedicated columns, are never
 * logged, and MUST be encrypted at rest before go-live. We persist only a curated
 * `govLookup` (signals, no raw payload / no government photo).
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { prisma, type Prisma, type VerificationRejectReason } from '@hq/database';
import { ApiError } from '../../app.js';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';
import { writeAudit } from '../audit.js';
import { RT } from '../../realtime/events.js';
import { logger } from '../../logger.js';
import type { RealtimeGateway } from '../../realtime/gateway.js';
import type { KycPort, KycResult } from './port/kyc-port.js';

const MAX_KYC_ATTEMPTS = 5;

const REJECT_REASONS: ReadonlySet<string> = new Set<VerificationRejectReason>([
  'UNCLEAR_ID',
  'SELFIE_MISMATCH',
  'LIVENESS_FAILED',
  'ID_NOT_FOUND',
  'NAME_MISMATCH',
  'WATCHLISTED',
  'EXPIRED_DOCUMENT',
  'POOR_IMAGE',
  'OTHER',
]);

function toReasonCode(code: string | undefined): VerificationRejectReason {
  return code && REJECT_REASONS.has(code) ? (code as VerificationRejectReason) : 'OTHER';
}

const wrap =
  (fn: (req: AuthedRequest, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req as AuthedRequest, res).catch(next);
  };

/** Authed usher-facing KYC routes (mounted at /api/me/verification). */
export function kycRouter(deps: { kyc: KycPort }): Router {
  const r = Router();

  r.post(
    '/kyc/start',
    requireAuth,
    wrap(async (req, res) => {
      const usher = await prisma.usher.findFirst({ where: { userId: req.auth.userId }, select: { id: true, kycAttempts: true } });
      if (!usher) throw new ApiError(403, 'NOT_AN_USHER', 'only ushers verify identity');
      if (usher.kycAttempts >= MAX_KYC_ATTEMPTS) {
        throw new ApiError(429, 'KYC_ATTEMPTS_EXCEEDED', 'Too many verification attempts. Please contact support.');
      }
      const referenceId = randomUUID();
      await prisma.$transaction([
        prisma.usherVerification.create({
          data: { usherId: usher.id, method: 'BIOMETRIC', provider: 'DOJAH', dojahReferenceId: referenceId, status: 'PENDING' },
        }),
        prisma.usher.update({ where: { id: usher.id }, data: { kycAttempts: { increment: 1 } } }),
      ]);
      const session = await deps.kyc.startSession(referenceId);
      res.status(201).json(session);
    }),
  );

  return r;
}

/** Dojah `kyc.widget` webhook (mounted at /webhooks/dojah with express.raw). */
export function dojahWebhookRouter(deps: { kyc: KycPort; realtime: RealtimeGateway }): Router {
  const r = Router();

  r.post('/', (req: Request, res: Response, next: NextFunction) => {
    void handle(req, res).catch(next);
  });

  async function handle(req: Request, res: Response): Promise<void> {
    const raw = req.body as Buffer;
    const parsed = deps.kyc.verifyWebhook(raw, req.headers);
    if (!parsed) {
      res.status(400).json({ error: { code: 'INVALID_WEBHOOK', message: 'unverified or unparseable' } });
      return;
    }
    const { referenceId, result } = parsed;
    const ver = await prisma.usherVerification.findFirst({
      where: { dojahReferenceId: referenceId },
      orderBy: { createdAt: 'desc' },
      include: { usher: { select: { id: true, userId: true } } },
    });
    // Unknown reference: ack so Dojah stops retrying.
    if (!ver) {
      res.status(200).json({ ok: true });
      return;
    }

    const status = result.decision === 'verified' ? 'APPROVED' : result.decision === 'rejected' ? 'REJECTED' : 'PENDING';
    // Curated signals only — never the raw payload or the government photo (NDPR).
    const govLookup: Prisma.InputJsonValue = {
      livenessPassed: result.livenessPassed ?? null,
      faceMatchScore: result.faceMatchScore ?? null,
      watchListed: result.watchListed ?? null,
      idFound: Boolean(result.nin ?? result.bvn),
    };

    await prisma.$transaction(async (tx) => {
      await tx.usherVerification.update({
        where: { id: ver.id },
        data: {
          status,
          provider: 'DOJAH',
          nin: result.nin ?? null,
          bvn: result.bvn ?? null,
          livenessPassed: result.livenessPassed ?? null,
          faceMatchScore: result.faceMatchScore ?? null,
          watchListed: result.watchListed ?? null,
          govLookup,
          reasonCode: result.decision === 'rejected' ? toReasonCode(result.reasonCode) : null,
          reviewedAt: result.decision === 'pending' ? null : new Date(),
        },
      });
      if (result.decision === 'verified') {
        await tx.usher.update({ where: { id: ver.usher.id }, data: { verificationStatus: 'VERIFIED', verifiedAt: new Date() } });
      } else if (result.decision === 'rejected') {
        await tx.usher.update({ where: { id: ver.usher.id }, data: { verificationStatus: 'REJECTED' } });
      }
    });

    deps.realtime.emitToUser(ver.usher.userId, RT.VERIFICATION_UPDATED, { status: result.decision });
    await writeAudit({ actorId: ver.usher.userId, action: 'verification.kyc_result', target: ver.id, metadata: { decision: result.decision, provider: 'DOJAH' } });
    logResult(referenceId, result);
    res.status(200).json({ ok: true });
  }

  function logResult(referenceId: string, result: KycResult): void {
    // Never log NIN/BVN — only the decision + non-PII signals.
    logger.info({ referenceId, decision: result.decision, watchListed: result.watchListed }, 'dojah kyc result');
  }

  return r;
}
