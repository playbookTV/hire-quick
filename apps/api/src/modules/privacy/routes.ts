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
import { STORAGE_TX } from '../storage/uploads.js';
import type { StoragePort } from '../storage/storage.js';
import { buildExport, eraseUser } from './service.js';
import { setConsent } from './consent.js';

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

export function privacyRouter(_storage?: StoragePort): Router {
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
      const { storageKeys } = await prisma.$transaction((tx) => eraseUser(tx, userId), STORAGE_TX);
      // Object I/O runs in the worker; erasure must not wait through provider retries.
      const pending = await prisma.storageDeletion.count({
        where: { key: { in: storageKeys }, completedAt: null },
      });
      await writeAudit({ actorId: userId, action: 'dsar.erase', target: userId });
      res.json({ status: 'ERASED', objectsDeleted: 0, objectsPending: pending });
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
      res.json(await setConsent(userId, purpose, granted));
    }),
  );

  return r;
}
