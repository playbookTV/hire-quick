/** Biometric sessions and authenticated Dojah callbacks (raw body mounted by app.ts). */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { prisma } from '@hq/database';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';
import { writeAudit } from '../audit.js';
import { RT } from '../../realtime/events.js';
import { logger } from '../../logger.js';
import type { RealtimeGateway } from '../../realtime/gateway.js';
import type { KycPort } from './port/kyc-port.js';
import { applyKycResult, startBiometricVerification } from './service.js';

export function kycRouter(deps: { kyc: KycPort }): Router {
  const r = Router();
  r.post('/kyc/start', requireAuth, (req: Request, res: Response, next: NextFunction) => {
    startBiometricVerification(prisma, (req as AuthedRequest).auth.userId, deps.kyc)
      .then((session) => res.status(201).json(session))
      .catch(next);
  });
  return r;
}

export function dojahWebhookRouter(deps: { kyc: KycPort; realtime: RealtimeGateway }): Router {
  const r = Router();
  r.post('/', (req: Request, res: Response, next: NextFunction) => {
    void handle(req, res).catch(next);
  });
  async function handle(req: Request, res: Response): Promise<void> {
    const parsed = Buffer.isBuffer(req.body) ? deps.kyc.verifyWebhook(req.body, req.headers) : null;
    if (!parsed) {
      res
        .status(401)
        .json({ error: { code: 'INVALID_WEBHOOK', message: 'unverified or unparseable' } });
      return;
    }
    const applied = await applyKycResult(prisma, parsed.referenceId, parsed.result);
    if (applied) {
      deps.realtime.emitToUser(applied.userId, RT.VERIFICATION_UPDATED, {
        status: applied.decision,
      });
      await writeAudit({
        actorId: applied.userId,
        action: 'verification.kyc_result',
        target: applied.id,
        metadata: { decision: applied.decision, provider: 'DOJAH' },
      });
      logger.info(
        { referenceId: parsed.referenceId, decision: applied.decision },
        'dojah kyc result',
      );
    }
    // Unknown, duplicate and superseded references do not mutate identity state.
    res.status(200).json({ ok: true });
  }
  return r;
}
