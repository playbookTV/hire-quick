/**
 * Admin actions (TRD §15). Verification approve/reject gates whether an usher is
 * discoverable/payable. Every action is audit-logged.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '@hq/database';
import { ApiError } from '../../app.js';
import { requireAuth, requireRole, type AuthedRequest } from '../auth/middleware.js';
import { writeAudit } from '../audit.js';

type Handler = (req: AuthedRequest, res: Response) => Promise<void>;
const wrap =
  (h: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    h(req as AuthedRequest, res).catch(next);
  };

const rejectSchema = z.object({ reason: z.string().min(3).max(500) });

export function adminRouter(): Router {
  const r = Router();
  r.use(requireAuth, requireRole('ADMIN'));

  r.post(
    '/verifications/:id/approve',
    wrap(async (req, res) => {
      const id = String(req.params.id);
      const v = await prisma.usherVerification.findUnique({ where: { id } });
      if (!v) throw new ApiError(404, 'NOT_FOUND', 'verification not found');
      await prisma.$transaction([
        prisma.usherVerification.update({
          where: { id },
          data: { status: 'APPROVED', reviewedById: req.auth.userId },
        }),
        prisma.usher.update({ where: { id: v.usherId }, data: { verificationStatus: 'VERIFIED' } }),
      ]);
      await writeAudit({ actorId: req.auth.userId, action: 'verification.approve', target: id });
      res.json({ id, status: 'APPROVED' });
    }),
  );

  r.post(
    '/verifications/:id/reject',
    wrap(async (req, res) => {
      const id = String(req.params.id);
      const { reason } = rejectSchema.parse(req.body);
      const v = await prisma.usherVerification.findUnique({ where: { id } });
      if (!v) throw new ApiError(404, 'NOT_FOUND', 'verification not found');
      await prisma.$transaction([
        prisma.usherVerification.update({
          where: { id },
          data: { status: 'REJECTED', reviewedById: req.auth.userId, reason },
        }),
        prisma.usher.update({ where: { id: v.usherId }, data: { verificationStatus: 'REJECTED' } }),
      ]);
      await writeAudit({ actorId: req.auth.userId, action: 'verification.reject', target: id, metadata: { reason } });
      res.json({ id, status: 'REJECTED' });
    }),
  );

  return r;
}
