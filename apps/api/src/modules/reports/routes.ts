import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '@hq/database';
import { marketplaceReportSchema, reviewReportSchema } from '@hq/shared';
import { requireAuth, requireRole, type AuthedRequest } from '../auth/middleware.js';
import { ApiError } from '../../app.js';
import { writeAudit } from '../audit.js';
import { lockUploadOwner } from '../storage/uploads.js';

const wrap =
  (handler: (req: AuthedRequest, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    handler(req as AuthedRequest, res).catch(next);
  };

/** Reports are private moderation records, independent of booking disputes and funds. */
export function reportsRouter(): Router {
  const r = Router();
  r.use(requireAuth);
  r.post(
    '/reports',
    wrap(async (req, res) => {
      const body = marketplaceReportSchema.parse(req.body);
      const report = await prisma.$transaction(async (tx) => {
        await lockUploadOwner(tx, req.auth.userId);
        if (body.targetType === 'JOB') {
          if (req.auth.role !== 'USHER')
            throw new ApiError(403, 'FORBIDDEN', 'Only workers can report jobs.');
          const event = await tx.event.findFirst({
            where: {
              id: body.targetId,
              OR: [
                { status: { in: ['OPEN', 'PARTIALLY_STAFFED'] } },
                { applications: { some: { usher: { userId: req.auth.userId } } } },
                { bookings: { some: { usher: { userId: req.auth.userId } } } },
                { invitations: { some: { usher: { userId: req.auth.userId } } } },
              ],
            },
            select: { id: true },
          });
          if (!event) throw new ApiError(404, 'NOT_FOUND', 'Job not found.');
        } else {
          if (req.auth.role !== 'CLIENT')
            throw new ApiError(403, 'FORBIDDEN', 'Only clients can report workers.');
          const worker = await tx.usher.findFirst({
            where: {
              id: body.targetId,
              verificationStatus: 'VERIFIED',
              user: { status: 'ACTIVE' },
            },
            select: { id: true },
          });
          if (!worker) throw new ApiError(404, 'NOT_FOUND', 'Worker not found.');
        }
        const target =
          body.targetType === 'JOB' ? { eventId: body.targetId } : { usherId: body.targetId };
        const existing = await tx.marketplaceReport.findFirst({
          where: { reporterId: req.auth.userId, ...target },
        });
        if (existing) return existing;
        const created = await tx.marketplaceReport.create({
          data: {
            reporterId: req.auth.userId,
            ...target,
            reason: body.reason,
            details: body.details,
          },
        });
        await writeAudit(
          {
            actorId: req.auth.userId,
            action: 'marketplace.report',
            target: created.id,
            metadata: { targetType: body.targetType },
          },
          tx,
        );
        return created;
      });
      // Never return reviewer notes or identities to the reporting client.
      res.status(201).json({ id: report.id, status: report.status });
    }),
  );
  return r;
}

export function adminReportsRouter(): Router {
  const r = Router();
  r.use(requireAuth, requireRole('ADMIN'));
  r.get(
    '/reports',
    wrap(async (req, res) => {
      const q = z
        .object({
          cursor: z.string().uuid().optional(),
          status: z.enum(['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED']).optional(),
        })
        .parse(req.query);
      const rows = await prisma.marketplaceReport.findMany({
        where: q.status ? { status: q.status } : {},
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 51,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        include: {
          event: {
            select: { id: true, title: true, category: true, client: { select: { userId: true } } },
          },
          usher: { select: { id: true, displayName: true, userId: true } },
        },
      });
      res.setHeader('Cache-Control', 'no-store');
      await writeAudit({
        actorId: req.auth.userId,
        action: 'marketplace.reports.read',
        target: 'reports',
        metadata: { count: rows.length },
      });
      res.json({ items: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49]!.id : null });
    }),
  );
  r.patch(
    '/reports/:id',
    wrap(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      const body = reviewReportSchema.parse(req.body);
      const result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM marketplace_reports WHERE id = ${id}::uuid FOR UPDATE`;
        const report = await tx.marketplaceReport.findUnique({ where: { id } });
        if (!report) throw new ApiError(404, 'NOT_FOUND', 'Report not found.');
        if (
          report.status !== body.expectedStatus ||
          report.status === body.status ||
          !['OPEN', 'UNDER_REVIEW'].includes(report.status)
        )
          throw new ApiError(
            409,
            'REPORT_CHANGED',
            'This report has changed. Reload before reviewing it.',
          );
        const updated = await tx.marketplaceReport.update({
          where: { id },
          data: {
            status: body.status,
            reviewNote: body.note,
            reviewedById: req.auth.userId,
            reviewedAt: new Date(),
          },
        });
        await writeAudit(
          {
            actorId: req.auth.userId,
            action: 'marketplace.report.review',
            target: id,
            metadata: { from: report.status, to: body.status },
          },
          tx,
        );
        return updated;
      });
      res.json({ id: result.id, status: result.status });
    }),
  );
  r.get(
    '/presentation-policies',
    wrap(async (_req, res) => {
      res.json(await prisma.presentationPolicy.findMany({ orderBy: { category: 'asc' } }));
    }),
  );
  r.put(
    '/presentation-policies',
    wrap(async (req, res) => {
      const body = z
        .object({
          category: z
            .string()
            .trim()
            .min(2)
            .max(60)
            .transform((s) => s.toLowerCase()),
          enabled: z.boolean(),
        })
        .parse(req.body);
      const policy = await prisma.$transaction(async (tx) => {
        const saved = await tx.presentationPolicy.upsert({
          where: { category: body.category },
          create: body,
          update: { enabled: body.enabled },
        });
        await writeAudit(
          {
            actorId: req.auth.userId,
            action: 'presentation.policy',
            target: body.category,
            metadata: { enabled: body.enabled },
          },
          tx,
        );
        return saved;
      });
      res.json(policy);
    }),
  );
  return r;
}
