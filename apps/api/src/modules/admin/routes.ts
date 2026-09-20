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
import {
  resolveDispute,
  createRefund,
  decideApproval,
  APPROVAL_THRESHOLD_KOBO,
} from './service.js';
import { createMilestoneTierSchema, updateMilestoneTierSchema } from '@hq/shared';
import type { RealtimeGateway } from '../../realtime/gateway.js';
import type { PaystackPort } from '../payments/port/paystack-port.js';
import { type StoragePort, presignDoc } from '../storage/storage.js';
import { authorizedChatMediaKey } from '../storage/chat-media.js';
import { pageQuery, pageResult } from './pagination.js';
import { reviewVerification } from '../verification/service.js';

type Handler = (req: AuthedRequest, res: Response) => Promise<void>;
const wrap =
  (h: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    h(req as AuthedRequest, res).catch(next);
  };

const REJECT_REASON_CODES = [
  'UNCLEAR_ID',
  'SELFIE_MISMATCH',
  'LIVENESS_FAILED',
  'ID_NOT_FOUND',
  'NAME_MISMATCH',
  'WATCHLISTED',
  'EXPIRED_DOCUMENT',
  'POOR_IMAGE',
  'OTHER',
] as const;
const rejectSchema = z.object({
  reason: z.string().min(3).max(500),
  reasonCode: z.enum(REJECT_REASON_CODES).optional(),
});

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
    if (!deps.paystack)
      throw new ApiError(503, 'PAYMENTS_UNAVAILABLE', 'payments are not configured');
    return deps.paystack;
  };

  // dashboard counters
  r.get(
    '/stats',
    wrap(async (_req, res) => {
      const [pendingVerifications, openDisputes, pendingApprovals, users, held] = await Promise.all(
        [
          prisma.usherVerification.count({ where: { status: 'PENDING' } }),
          prisma.dispute.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } }),
          prisma.approval.count({ where: { status: 'PENDING' } }),
          prisma.user.count(),
          prisma.payment.aggregate({
            where: { escrowStatus: 'HELD' },
            _sum: { grossAmount: true },
          }),
        ],
      );
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
      const status = z
        .enum(['PENDING', 'APPROVED', 'REJECTED'])
        .catch('PENDING')
        .parse(req.query.status);
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
          idDocumentUrl: v.idDocumentUrl ? await presignDoc(deps.storage, v.idDocumentUrl) : null,
          selfieUrl: v.selfieUrl ? await presignDoc(deps.storage, v.selfieUrl) : null,
        })),
      );
      res.json(resolved);
    }),
  );

  r.post(
    '/verifications/:id/approve',
    wrap(async (req, res) => {
      const id = String(req.params.id);
      const result = await reviewVerification(prisma, {
        verificationId: id,
        adminId: req.auth.userId,
        decision: 'APPROVED',
      });
      if (result.changed)
        await writeAudit({ actorId: req.auth.userId, action: 'verification.approve', target: id });
      res.json({ id, status: 'APPROVED' });
    }),
  );

  r.post(
    '/verifications/:id/reject',
    wrap(async (req, res) => {
      const id = String(req.params.id);
      const { reason, reasonCode } = rejectSchema.parse(req.body);
      const result = await reviewVerification(prisma, {
        verificationId: id,
        adminId: req.auth.userId,
        decision: 'REJECTED',
        reason,
        reasonCode: reasonCode ?? 'OTHER',
      });
      if (result.changed)
        await writeAudit({
          actorId: req.auth.userId,
          action: 'verification.reject',
          target: id,
          metadata: { reason, reasonCode: reasonCode ?? 'OTHER' },
        });
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
      const out = await resolveDispute(
        req.auth.userId,
        String(req.params.id),
        outcome,
        resolution,
        requirePaystack(),
        deps.realtime,
      );
      res.json(out);
    }),
  );

  r.get(
    '/bookings',
    wrap(async (req, res) => {
      const page = pageQuery.parse(req.query);
      const query = z.string().max(120).default('').parse(req.query.query).trim();
      const uuid = z.string().uuid().safeParse(query);
      const rows = await prisma.booking.findMany({
        where: query
          ? {
              OR: [
                ...(uuid.success ? [{ id: uuid.data }] : []),
                { event: { title: { contains: query, mode: 'insensitive' } } },
                { event: { client: { displayName: { contains: query, mode: 'insensitive' } } } },
                { usher: { displayName: { contains: query, mode: 'insensitive' } } },
              ],
            }
          : {},
        select: {
          id: true,
          status: true,
          amount: true,
          createdAt: true,
          event: { select: { title: true } },
          usher: { select: { displayName: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: page.limit + 1,
        ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
      });
      res.json(pageResult(rows, page.limit));
    }),
  );

  // Read-only case context; money decisions still use the existing guarded service.
  r.get(
    '/bookings/:id/review',
    wrap(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      const booking = await prisma.booking.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          amount: true,
          attendanceMethod: true,
          arrivalAssertedAt: true,
          checkedInAt: true,
          completedAt: true,
          event: {
            select: {
              title: true,
              venue: true,
              eventDate: true,
              startTime: true,
              endTime: true,
              client: { select: { user: { select: { id: true, phone: true } } } },
            },
          },
          usher: { select: { displayName: true, user: { select: { id: true, phone: true } } } },
          payment: {
            select: { grossAmount: true, usherPayout: true, platformFee: true, escrowStatus: true },
          },
          conversation: {
            select: {
              messages: {
                orderBy: { createdAt: 'asc' },
                select: {
                  id: true,
                  senderId: true,
                  contentType: true,
                  content: true,
                  createdAt: true,
                },
              },
            },
          },
          disputes: {
            select: {
              id: true,
              reason: true,
              note: true,
              status: true,
              resolution: true,
              createdAt: true,
              raisedBy: { select: { id: true, phone: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      if (!booking) throw new ApiError(404, 'NOT_FOUND', 'Booking not found');
      await writeAudit({ actorId: req.auth.userId, action: 'admin.booking.review', target: id });
      const messages = await Promise.all(
        (booking.conversation?.messages ?? []).map(async (message) => {
          const key = authorizedChatMediaKey(message, {
            bookingId: id,
            clientUserId: booking.event.client.user.id,
            usherUserId: booking.usher.user.id,
          });
          return {
            id: message.id,
            sender: message.senderId === booking.event.client.user.id ? 'Client' : 'Usher',
            contentType: message.contentType,
            content: message.contentType === 'TEXT' ? message.content : null,
            createdAt: message.createdAt,
            mediaUrl: key && deps.storage ? await deps.storage.presignDownload(key) : null,
          };
        }),
      );
      const refund = await prisma.paymentOperation.findUnique({
        where: { dedupeKey: `BOOKING_REFUND:${id}` },
        select: { id: true, status: true, providerRef: true, updatedAt: true },
      });
      const refundApprovals = await prisma.approval.findMany({
        where: { kind: 'REFUND', payload: { path: ['bookingId'], equals: id } },
        select: { id: true, status: true, amountKobo: true, updatedAt: true },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ ...booking, conversation: undefined, messages, refund, refundApprovals });
    }),
  );

  // --- refunds (maker-checker) ---
  r.post(
    '/refunds',
    wrap(async (req, res) => {
      const { bookingId, amountKobo, reason } = z
        .object({
          bookingId: z.string().uuid(),
          amountKobo: z.number().int().positive(),
          reason: z.string().min(3).max(500),
        })
        .parse(req.body);
      const out = await createRefund(
        req.auth.userId,
        bookingId,
        amountKobo,
        reason,
        requirePaystack(),
      );
      res.json(out);
    }),
  );

  // --- approvals (checker) ---
  r.get(
    '/approvals',
    wrap(async (req, res) => {
      const status = z
        .enum(['PENDING', 'APPROVED', 'REJECTED', 'EXECUTED'])
        .catch('PENDING')
        .parse(req.query.status);
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
      await decideApproval(
        req.auth.userId,
        String(req.params.id),
        decision,
        requirePaystack(),
        deps.realtime,
      );
      res.json({ ok: true });
    }),
  );

  // --- escrow ledger ---
  r.get(
    '/ledger',
    wrap(async (req, res) => {
      const page = pageQuery.parse(req.query);
      const bookingId = z.string().uuid().optional().parse(req.query.bookingId);
      const entries = await prisma.escrowLedger.findMany({
        where: { ...(bookingId ? { bookingId } : {}) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: page.limit + (page.paged ? 1 : 0),
        ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
        include: { booking: { select: { id: true, event: { select: { title: true } } } } },
      });
      res.json(page.paged ? pageResult(entries, page.limit) : entries);
    }),
  );

  // --- users ---
  r.get(
    '/users',
    wrap(async (req, res) => {
      const page = pageQuery.parse(req.query);
      const q = z.string().trim().max(200).optional().parse(req.query.query);
      const role = z.enum(['CLIENT', 'USHER', 'ADMIN']).optional().parse(req.query.role);
      const users = await prisma.user.findMany({
        where: {
          ...(q
            ? {
                OR: [
                  { phone: { contains: q } },
                  { email: { contains: q, mode: 'insensitive' as const } },
                ],
              }
            : {}),
          ...(role ? { role } : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: page.limit + (page.paged ? 1 : 0),
        ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
        select: { id: true, role: true, phone: true, email: true, status: true, createdAt: true },
      });
      res.json(page.paged ? pageResult(users, page.limit) : users);
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
      await writeAudit({
        actorId: req.auth.userId,
        action: 'milestoneTier.create',
        target: tier.id,
        metadata: body,
      });
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
      await writeAudit({
        actorId: req.auth.userId,
        action: 'milestoneTier.update',
        target: id,
        metadata: body,
      });
      res.json(tier);
    }),
  );

  // Soft-delete: deactivate so existing unlocks and history are preserved.
  r.delete(
    '/milestone-tiers/:id',
    wrap(async (req, res) => {
      const id = String(req.params.id);
      const tier = await prisma.milestoneTier.update({ where: { id }, data: { active: false } });
      await writeAudit({
        actorId: req.auth.userId,
        action: 'milestoneTier.deactivate',
        target: id,
      });
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
      if (m.status !== 'UNLOCKED')
        throw new ApiError(409, 'ALREADY_FULFILLED', 'milestone already fulfilled');
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
