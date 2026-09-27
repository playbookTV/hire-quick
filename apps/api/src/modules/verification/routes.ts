import { reportSmile, tagSmileError } from '../../observability/smile.js';
import type { Redis } from 'ioredis';
import { cacheReviewEvidence } from './evidence.js';
/** Biometric sessions and authenticated Smile ID callbacks (raw body mounted by app.ts). */
import { z } from 'zod';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { prisma } from '@hq/database';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';
import { writeAudit } from '../audit.js';
import { RT } from '../../realtime/events.js';
import { logger } from '../../logger.js';
import type { RealtimeGateway } from '../../realtime/gateway.js';
import type { KycPort } from './port/kyc-port.js';
import { applyKycResult, startBiometricVerification } from './service.js';

const identitySchema = z.object({
  idType: z.enum(['NIN', 'BVN']),
  idNumber: z.string().regex(/^\d{11}$/),
  givenNames: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254).optional(),
  referenceId: z.string().uuid().optional(),
});

export function kycRouter(deps: { kyc: KycPort }): Router {
  const r = Router();
  r.post('/kyc/start', requireAuth, (req: Request, res: Response, next: NextFunction) => {
    const parsed = identitySchema.safeParse(req.body);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    startBiometricVerification(
      prisma,
      (req as AuthedRequest).auth.userId,
      deps.kyc,
      parsed.data,
      parsed.data.referenceId,
    )
      .then((session) => res.status(201).json(session))
      .catch((error: unknown) => next(tagSmileError(
        error instanceof Error ? error : new Error('Smile session failed'), 'SMILE_SESSION_FAILED',
      )));
  });
  return r;
}

export function smileWebhookRouter(deps: {
  kyc: KycPort;
  realtime: RealtimeGateway;
  redis?: Redis | undefined;
}): Router {
  const r = Router();
  r.post('/:referenceId/:callbackKey', (req: Request, res: Response, next: NextFunction) => {
    void handle(req, res).catch((error: unknown) => next(tagSmileError(
      error instanceof Error ? error : new Error('Smile callback failed'), 'SMILE_CALLBACK_FAILED',
    )));
  });
  async function handle(req: Request, res: Response): Promise<void> {
    const parsed = Buffer.isBuffer(req.body)
      ? deps.kyc.verifyWebhook(
          req.body,
          req.headers,
          String(req.params.referenceId),
          String(req.params.callbackKey),
        )
      : null;
    if (!parsed) {
      // Invalid callback paths are untrusted; do not attach their reference or secret.
      reportSmile('SMILE_INVALID_CALLBACK');
      res
        .status(401)
        .json({ error: { code: 'INVALID_WEBHOOK', message: 'unverified or unparseable' } });
      return;
    }
    const result = await deps.kyc.getResult(parsed.jobId, parsed.userId).catch((error: unknown) => {
      throw tagSmileError(error instanceof Error ? error : new Error('Smile result unavailable'),
        'SMILE_RESULT_FETCH_FAILED', parsed.referenceId);
    });
    await cacheReviewEvidence(deps.redis, parsed, result);
    const applied = await applyKycResult(prisma, parsed.referenceId, result);
    if (result.providerStatus === 'error') reportSmile('SMILE_PROVIDER_ERROR', parsed.referenceId);
    else if (result.providerStatus === 'attention') reportSmile('SMILE_PROVIDER_ATTENTION', parsed.referenceId);
    if (applied?.decision === 'rejected') reportSmile('SMILE_PROVIDER_REJECTED', parsed.referenceId);
    if (applied) {
      deps.realtime.emitToUser(applied.userId, RT.VERIFICATION_UPDATED, {
        status: applied.decision,
      });
      await writeAudit({
        actorId: applied.userId,
        action: 'verification.kyc_result',
        target: applied.id,
        metadata: { decision: applied.decision, provider: 'SMILE_ID' },
      });
      logger.info(
        { referenceId: parsed.referenceId, decision: applied.decision },
        'smile kyc result',
      );
    }
    // Unknown, duplicate and superseded references do not mutate identity state.
    res.status(200).json({ ok: true });
  }
  return r;
}
