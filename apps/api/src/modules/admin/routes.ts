/**
 * Admin API (TRD §15). All routes require an ADMIN role; money actions go
 * through the maker-checker service. Every mutation is audit-logged.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '@hq/database';
import { ApiError } from '../../app.js';
import { requireAuth, requireRole, type AuthedRequest } from '../auth/middleware.js';
import { writeAudit } from '../audit.js';
import { resolveDispute, createRefund, decideApproval, APPROVAL_THRESHOLD_KOBO } from './service.js';

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

  // dashboard counters
  r.get(
    '/stats',
    wrap(async (_req, res) => {
      const [pendingVerifications, openDisputes, pendingApprovals, users, held] = await Promise.all([
        prisma.usherVerification.count({ where: { status: 'PENDING' } }),
        prisma.dispute.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } }),
        prisma.approval.count({ where: { status: 'PENDING' } }),
        prisma.user.count(),
        prisma.payment.aggregate({ where: { escrowStatus: 'HELD' }, _sum: { grossAmount: true } }),
      ]);
      res.json({
        pendingVerifications,
        openDisputes,
        pendingApprovals,
        users,
        escrowHeldKobo: held._sum.grossAmount ?? 0,
        approvalThresholdKobo: APPROVAL_THRESHOLD_KOBO,
      });
    }),
  );

  // --- verifications ---
  r.get(
    '/verifications',
    wrap(async (req, res) => {
      const status = z.enum(['PENDING', 'APPROVED', 'REJECTED']).catch('PENDING').parse(req.query.status);
      res.json(
        await prisma.usherVerification.findMany({
          where: { status },
          orderBy: { createdAt: 'asc' },
          include: { usher: { include: { user: { select: { phone: true, email: true } } } } },
        }),
      );
    }),
  );

  r.post(
    '/verifications/:id/approve',
    wrap(async (req, res) => {
      const id = String(req.params.id);
      const v = await prisma.usherVerification.findUnique({ where: { id } });
      if (!v) throw new ApiError(404, 'NOT_FOUND', 'verification not found');
      await prisma.$transaction([
        prisma.usherVerification.update({ where: { id }, data: { status: 'APPROVED', reviewedById: req.auth.userId } }),
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
        prisma.usherVerification.update({ where: { id }, data: { status: 'REJECTED', reviewedById: req.auth.userId, reason } }),
        prisma.usher.update({ where: { id: v.usherId }, data: { verificationStatus: 'REJECTED' } }),
      ]);
      await writeAudit({ actorId: req.auth.userId, action: 'verification.reject', target: id, metadata: { reason } });
      res.json({ id, status: 'REJECTED' });
    }),
  );

  // --- disputes ---
  r.get(
    '/disputes',
    wrap(async (req, res) => {
      const open = req.query.status !== 'ALL';
      res.json(
        await prisma.dispute.findMany({
          where: open ? { status: { in: ['OPEN', 'UNDER_REVIEW'] } } : {},
          orderBy: { createdAt: 'desc' },
          include: { booking: { include: { event: { select: { title: true } }, payment: true } } },
        }),
      );
    }),
  );

  r.post(
    '/disputes/:id/resolve',
    wrap(async (req, res) => {
      const { outcome, resolution } = z
        .object({ outcome: z.enum(['RELEASE', 'REFUND']), resolution: z.string().min(3).max(1000) })
        .parse(req.body);
      const out = await resolveDispute(req.auth.userId, String(req.params.id), outcome, resolution);
      res.json(out);
    }),
  );

  // --- refunds (maker-checker) ---
  r.post(
    '/refunds',
    wrap(async (req, res) => {
      const { bookingId, amountKobo, reason } = z
        .object({ bookingId: z.string().uuid(), amountKobo: z.number().int().positive(), reason: z.string().min(3).max(500) })
        .parse(req.body);
      const out = await createRefund(req.auth.userId, bookingId, amountKobo, reason);
      res.json(out);
    }),
  );

  // --- approvals (checker) ---
  r.get(
    '/approvals',
    wrap(async (req, res) => {
      const status = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXECUTED']).catch('PENDING').parse(req.query.status);
      res.json(
        await prisma.approval.findMany({
          where: { status },
          orderBy: { createdAt: 'desc' },
          include: { maker: { select: { phone: true } }, checker: { select: { phone: true } } },
        }),
      );
    }),
  );

  r.post(
    '/approvals/:id',
    wrap(async (req, res) => {
      const { decision } = z.object({ decision: z.enum(['approve', 'reject']) }).parse(req.body);
      await decideApproval(req.auth.userId, String(req.params.id), decision);
      res.json({ ok: true });
    }),
  );

  // --- escrow ledger ---
  r.get(
    '/ledger',
    wrap(async (req, res) => {
      const limit = Math.min(Number(req.query.limit ?? 100), 250);
      res.json(
        await prisma.escrowLedger.findMany({
          orderBy: { createdAt: 'desc' },
          take: limit,
          include: { booking: { select: { id: true, event: { select: { title: true } } } } },
        }),
      );
    }),
  );

  // --- users ---
  r.get(
    '/users',
    wrap(async (req, res) => {
      const q = typeof req.query.query === 'string' ? req.query.query : undefined;
      res.json(
        await prisma.user.findMany({
          where: q ? { OR: [{ phone: { contains: q } }, { email: { contains: q } }] } : {},
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: { id: true, role: true, phone: true, email: true, status: true, createdAt: true },
        }),
      );
    }),
  );

  for (const [action, status] of [
    ['suspend', 'SUSPENDED'],
    ['reinstate', 'ACTIVE'],
  ] as const) {
    r.post(
      `/users/:id/${action}`,
      wrap(async (req, res) => {
        const id = String(req.params.id);
        await prisma.user.update({ where: { id }, data: { status } });
        await writeAudit({ actorId: req.auth.userId, action: `user.${action}`, target: id });
        res.json({ id, status });
      }),
    );
  }

  return r;
}
