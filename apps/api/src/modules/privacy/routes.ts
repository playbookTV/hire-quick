/**
 * Data-subject rights — NDPR access + erasure (TRD §14). Mounted at /api/me.
 * Logic lives in service.ts; this file is just the HTTP surface.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '@hq/database';
import { ApiError } from '../../app.js';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';
import { requireIdempotencyKey } from '../payments/http/middleware.js';
import { writeAudit } from '../audit.js';
import type { StoragePort } from '../storage/storage.js';
import { buildExport, eraseUser } from './service.js';

type Handler = (req: AuthedRequest, res: Response) => Promise<void>;
const wrap =
  (h: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    h(req as AuthedRequest, res).catch(next);
  };

const consentSchema = z.object({
  purpose: z.enum(['PUSH_NOTIFICATIONS', 'MARKETING_EMAIL', 'SMS']),
  granted: z.boolean(),
});

export function privacyRouter(storage?: StoragePort): Router {
  const r = Router();
  r.use(requireAuth);

  // GET /api/me/export — the subject's own data, machine-readable.
  r.get(
    '/export',
    wrap(async (req, res) => {
      const userId = req.auth.userId;
      const bundle = await buildExport(userId);
      await writeAudit({ actorId: userId, action: 'dsar.export', target: userId });
      res.json(bundle);
    }),
  );

  // POST /api/me/erase — pseudonymize PII, retain financial records. Naturally
  // idempotent: a second call on an already-ANONYMIZED account is a no-op.
  r.post(
    '/erase',
    requireIdempotencyKey,
    wrap(async (req, res) => {
      const userId = req.auth.userId;
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new ApiError(404, 'NOT_FOUND', 'user not found');
      if (user.status === 'ANONYMIZED') {
        res.json({ status: 'ALREADY_ERASED', anonymizedAt: user.anonymizedAt });
        return;
      }
      const { storageKeys } = await prisma.$transaction((tx) => eraseUser(tx, userId));
      // Delete the underlying KYC/photo objects AFTER the references are scrubbed.
      // Best-effort and outside the DB tx: a failed object delete leaves an
      // orphan (no longer referenced) for a storage cleanup job, never a dangling
      // reference. Skipped when storage isn't configured (dev/legacy URLs).
      if (storage && storageKeys.length) {
        await Promise.all(
          storageKeys.map((k) =>
            storage.deleteObject(k).catch((e: unknown) => console.error('[erase] storage delete failed', k, e)),
          ),
        );
      }
      await writeAudit({ actorId: userId, action: 'dsar.erase', target: userId });
      res.json({ status: 'ERASED', objectsDeleted: storage ? storageKeys.length : 0 });
    }),
  );

  // GET /api/me/consents — the subject's current consent state per purpose (NDPR).
  r.get(
    '/consents',
    wrap(async (req, res) => {
      const consents = await prisma.consentRecord.findMany({
        where: { userId: req.auth.userId },
        select: { purpose: true, granted: true, source: true, grantedAt: true, withdrawnAt: true },
      });
      res.json(consents);
    }),
  );

  // POST /api/me/consents — grant or withdraw consent for a purpose. Withdrawing
  // PUSH_NOTIFICATIONS stops processing immediately by dropping the device tokens.
  r.post(
    '/consents',
    wrap(async (req, res) => {
      const { purpose, granted } = consentSchema.parse(req.body);
      const userId = req.auth.userId;
      const consent = await prisma.consentRecord.upsert({
        where: { userId_purpose: { userId, purpose } },
        update: {
          granted,
          source: 'EXPLICIT',
          withdrawnAt: granted ? null : new Date(),
          ...(granted ? { grantedAt: new Date() } : {}),
        },
        create: { userId, purpose, granted, source: 'EXPLICIT' },
      });
      if (purpose === 'PUSH_NOTIFICATIONS' && !granted) {
        await prisma.deviceToken.deleteMany({ where: { userId } });
      }
      await writeAudit({ actorId: userId, action: granted ? 'consent.grant' : 'consent.withdraw', target: purpose });
      res.json({ purpose: consent.purpose, granted: consent.granted });
    }),
  );

  return r;
}
