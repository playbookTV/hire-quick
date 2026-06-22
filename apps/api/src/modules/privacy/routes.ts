/**
 * Data-subject rights — NDPR access + erasure (TRD §14). Mounted at /api/me.
 * Logic lives in service.ts; this file is just the HTTP surface.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { prisma } from '@hq/database';
import { ApiError } from '../../app.js';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';
import { requireIdempotencyKey } from '../payments/http/middleware.js';
import { writeAudit } from '../audit.js';
import { buildExport, eraseUser } from './service.js';

type Handler = (req: AuthedRequest, res: Response) => Promise<void>;
const wrap =
  (h: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    h(req as AuthedRequest, res).catch(next);
  };

export function privacyRouter(): Router {
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
      await prisma.$transaction((tx) => eraseUser(tx, userId));
      await writeAudit({ actorId: userId, action: 'dsar.erase', target: userId });
      res.json({ status: 'ERASED' });
    }),
  );

  return r;
}
