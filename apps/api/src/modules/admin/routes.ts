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
import { createMilestoneTierSchema, updateMilestoneTierSchema } from '@hq/shared';
import type { RealtimeGateway } from '../../realtime/gateway.js';
import type { PaystackPort } from '../payments/port/paystack-port.js';
import { type StoragePort, presignDoc } from '../storage/storage.js';

type Handler = (req: AuthedRequest, res: Response) => Promise<void>;
const wrap =
  (h: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    h(req as AuthedRequest, res).catch(next);
  };

const rejectSchema = z.object({ reason: z.string().min(3).max(500) });

export function adminRouter(deps: {
  realtime: RealtimeGateway;
  storage?: StoragePort | undefined;
  paystack?: PaystackPort | undefined;
}): Router {
  const r = Router();
  r.use(requireAuth, requireRole('ADMIN'));

  // Refund/dispute execution issues a real Paystack refund, so those routes
  // can't run without a configured port.
  const requirePaystack = (): PaystackPort => {
    if (!deps.paystack) throw new ApiError(503, 'PAYMENTS_UNAVAILABLE', 'payments are not configured');
    return deps.paystack;
  };

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
      const list = await prisma.usherVerification.findMany({
        where: { status },
        orderBy: { createdAt: 'asc' },
        include: { usher: { include: { user: { select: { phone: true, email: true } } } } },
      });
      // Sensitive class (TRD §14): log who saw which ID documents. One aggregate
      // row per list view, not one per record, to stay proportionate.
      await writeAudit({
        actorId: req.auth.userId,
        action: 'verification.read',
        target: status,
        metadata: { byAdmin: true, count: list.length, ids: list.map((v) => v.id) },
      });
      const resolved = await Promise.all(
        list.map(async (v) => ({
          ...v,
          idDocumentUrl: await presignDoc(deps.storage, v.idDocumentUrl),
          selfieUrl: await presignDoc(deps.storage, v.selfieUrl),
        })),
      );
      res.json(resolved);
    }),
  );

  r.post(
    '/verifications/:id/approve',
    wrap(async (req, res) => {
      const id = String(req.params.id);
      const v = await prisma.usherVerification.findUnique({ where: { id } });
      if (!v) throw new ApiError(404, 'NOT_FOUND', 'verification not found');
      await prisma.$transaction([
        prisma.usherVerification.update({
          where: { id },
          data: { status: 'APPROVED', reviewedById: req.auth.userId, reviewedAt: new Date() },
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
          data: { status: 'REJECTED', reviewedById: req.auth.userId, reason, reviewedAt: new Date() },
        }),
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
      const out = await resolveDispute(req.auth.userId, String(req.params.id), outcome, resolution, requirePaystack(), deps.realtime);
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
      const out = await createRefund(req.auth.userId, bookingId, amountKobo, reason, requirePaystack());
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
      await decideApproval(req.auth.userId, String(req.params.id), decision, requirePaystack(), deps.realtime);
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

  // --- reward milestone tiers (admin config) ---
  r.get(
    '/milestone-tiers',
    wrap(async (_req, res) => {
      res.json(await prisma.milestoneTier.findMany({ orderBy: { threshold: 'asc' } }));
    }),
  );

  r.post(
    '/milestone-tiers',
    wrap(async (req, res) => {
      const body = createMilestoneTierSchema.parse(req.body);
      const tier = await prisma.milestoneTier.create({
        data: {
          threshold: body.threshold,
          name: body.name,
          rewardType: body.rewardType,
          description: body.description ?? null,
          ...(body.active === undefined ? {} : { active: body.active }),
        },
      });
      await writeAudit({ actorId: req.auth.userId, action: 'milestoneTier.create', target: tier.id, metadata: body });
      res.status(201).json(tier);
    }),
  );

  r.patch(
    '/milestone-tiers/:id',
    wrap(async (req, res) => {
      const id = String(req.params.id);
      const body = updateMilestoneTierSchema.parse(req.body);
      const data: {
        threshold?: number;
        name?: string;
        rewardType?: 'BADGE' | 'PHYSICAL';
        description?: string | null;
        active?: boolean;
      } = {};
      if (body.threshold !== undefined) data.threshold = body.threshold;
      if (body.name !== undefined) data.name = body.name;
      if (body.rewardType !== undefined) data.rewardType = body.rewardType;
      if (body.description !== undefined) data.description = body.description;
      if (body.active !== undefined) data.active = body.active;
      const tier = await prisma.milestoneTier.update({ where: { id }, data });
      await writeAudit({ actorId: req.auth.userId, action: 'milestoneTier.update', target: id, metadata: body });
      res.json(tier);
    }),
  );

  // Soft-delete: deactivate so existing unlocks and history are preserved.
  r.delete(
    '/milestone-tiers/:id',
    wrap(async (req, res) => {
      const id = String(req.params.id);
      const tier = await prisma.milestoneTier.update({ where: { id }, data: { active: false } });
      await writeAudit({ actorId: req.auth.userId, action: 'milestoneTier.deactivate', target: id });
      res.json({ id: tier.id, active: tier.active });
    }),
  );

  // --- milestone fulfilment queue (physical rewards await admin action) ---
  r.get(
    '/milestones',
    wrap(async (req, res) => {
      const status = req.query.status === 'FULFILLED' ? 'FULFILLED' : 'UNLOCKED';
      res.json(
        await prisma.usherMilestone.findMany({
          where: { status, tier: { rewardType: 'PHYSICAL' } },
          orderBy: { unlockedAt: 'asc' },
          include: {
            tier: true,
            usher: { include: { user: { select: { phone: true, email: true } } } },
          },
        }),
      );
    }),
  );

  r.post(
    '/milestones/:id/fulfill',
    wrap(async (req, res) => {
      const id = String(req.params.id);
      const m = await prisma.usherMilestone.findUnique({ where: { id } });
      if (!m) throw new ApiError(404, 'NOT_FOUND', 'milestone not found');
      if (m.status !== 'UNLOCKED') throw new ApiError(409, 'ALREADY_FULFILLED', 'milestone already fulfilled');
      const updated = await prisma.usherMilestone.update({
        where: { id },
        data: { status: 'FULFILLED', fulfilledAt: new Date(), fulfilledById: req.auth.userId },
      });
      await writeAudit({ actorId: req.auth.userId, action: 'milestone.fulfill', target: id });
      res.json({ id: updated.id, status: updated.status });
    }),
  );

  return r;
}
