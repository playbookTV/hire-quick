import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '@hq/database';
import type { AuthedRequest } from '../auth/middleware.js';
import { writeAudit } from '../audit.js';
import { pageQuery, pageResult } from './pagination.js';
import { reviewRecovery } from '../payments/recovery-schedule.js';
import { ApiError } from '../../app.js';

const wrap =
  (fn: (req: AuthedRequest, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    void fn(req as AuthedRequest, res).catch(next);
  };

/** Mounted behind adminRouter's authentication and ADMIN role check. */
export function paymentOperationsRouter(): Router {
  const r = Router();
  r.get(
    '/payment-operations',
    wrap(async (req, res) => {
      const page = pageQuery.parse(req.query);
      const rows = await prisma.paymentOperation.findMany({
        where: { status: { in: ['PENDING', 'PROVIDER_OK'] } },
        select: {
          id: true,
          kind: true,
          status: true,
          attempts: true,
          recoveryAttempts: true,
          nextAttemptAt: true,
          quarantinedAt: true,
          providerRef: true,
          lastError: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: page.limit + 1,
        ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
      });
      res.json(pageResult(rows, page.limit));
    }),
  );
  r.post(
    '/payment-operations/:id/review',
    wrap(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      const body = z
        .object({
          action: z.enum(['quarantine', 'resume']),
          evidence: z.string().trim().min(10).max(2000),
        })
        .parse(req.body);
      const op = await prisma.$transaction((tx) =>
        reviewRecovery(tx, { id, actorId: req.auth.userId, ...body }),
      );
      res.json({ id: op.id, status: op.status, quarantinedAt: op.quarantinedAt });
    }),
  );
  r.get(
    '/reconciliation-runs',
    wrap(async (req, res) => {
      const page = pageQuery.parse(req.query);
      const rows = await prisma.auditLog.findMany({
        where: { action: { in: ['reconciliation.run', 'reconciliation.error'] } },
        select: { id: true, target: true, action: true, metadata: true, createdAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: page.limit + 1,
        ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
      });
      const reviews = await prisma.auditLog.findMany({
        where: { action: 'reconciliation.review', target: { in: rows.map((row) => row.target) } },
        select: { target: true, metadata: true, createdAt: true },
        orderBy: { seq: 'desc' },
      });
      res.json(
        pageResult(
          rows.map((row) => ({
            ...row,
            review: reviews.find((review) => review.target === row.target) ?? null,
          })),
          page.limit,
        ),
      );
    }),
  );
  r.post(
    '/reconciliation-runs/:id/review',
    wrap(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      const body = z
        .object({
          outcome: z.enum(['investigating', 'explained', 'resolved']),
          evidence: z.string().trim().min(10).max(2000),
        })
        .parse(req.body);
      const run = await prisma.auditLog.findFirst({
        where: { target: id, action: { in: ['reconciliation.run', 'reconciliation.error'] } },
      });
      if (!run) throw new ApiError(404, 'NOT_FOUND', 'Reconciliation run not found');
      await writeAudit({
        actorId: req.auth.userId,
        action: 'reconciliation.review',
        target: id,
        metadata: body,
      });
      res.json({ ok: true });
    }),
  );
  return r;
}
