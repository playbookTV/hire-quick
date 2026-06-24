/**
 * Public-ish usher read surface (TRD §7, UXRD discover): client-side discovery,
 * a single usher profile, and the reviews an usher has received. Read-only.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '@hq/database';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';
import { type StoragePort, presignDoc } from '../storage/storage.js';

type Handler = (req: AuthedRequest, res: Response) => Promise<void>;
const wrap =
  (h: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    h(req as AuthedRequest, res).catch(next);
  };

const usherCard = {
  id: true,
  displayName: true,
  bio: true,
  yearsExperience: true,
  ratingAvg: true,
  ratingCount: true,
  completedJobsCount: true,
  reliabilityScore: true,
  verificationStatus: true,
  avatarKey: true,
} as const;

export function ushersRouter(storage?: StoragePort): Router {
  const r = Router();
  r.use(requireAuth);

  // discovery — verified ushers, optional text/rating filters
  r.get(
    '/ushers',
    wrap(async (req, res) => {
      const q = z
        .object({
          query: z.string().max(120).optional(),
          minRating: z.coerce.number().min(0).max(5).optional(),
          verified: z
            .enum(['true', 'false'])
            .optional()
            .transform((v) => v !== 'false'),
          limit: z.coerce.number().int().min(1).max(50).optional(),
        })
        .parse(req.query);
      const where: Record<string, unknown> = {};
      if (q.verified) where.verificationStatus = 'VERIFIED';
      if (q.minRating) where.ratingAvg = { gte: q.minRating };
      if (q.query) {
        where.OR = [
          { displayName: { contains: q.query, mode: 'insensitive' } },
          { bio: { contains: q.query, mode: 'insensitive' } },
        ];
      }
      const rows = await prisma.usher.findMany({
        where,
        orderBy: [{ completedJobsCount: 'desc' }, { ratingAvg: 'desc' }],
        take: q.limit ?? 20,
        select: usherCard,
      });
      // Cards carry the avatar only (not portfolios) to stay light; presigning
      // is CPU-only so per-row resolution is cheap.
      res.json(
        await Promise.all(
          rows.map(async ({ avatarKey, ...u }) => ({
            ...u,
            avatarUrl: avatarKey ? await presignDoc(storage, avatarKey) : null,
          })),
        ),
      );
    }),
  );

  // single usher profile — full detail incl. portfolio gallery
  r.get(
    '/ushers/:id',
    wrap(async (req, res) => {
      const { avatarKey, photos, ...u } = await prisma.usher.findUniqueOrThrow({
        where: { id: String(req.params.id) },
        select: { ...usherCard, photos: { select: { id: true, imageUrl: true }, orderBy: { createdAt: 'asc' } } },
      });
      res.json({
        ...u,
        avatarUrl: avatarKey ? await presignDoc(storage, avatarKey) : null,
        portfolio: await Promise.all(
          photos.map(async (p) => ({ id: p.id, imageUrl: await presignDoc(storage, p.imageUrl) })),
        ),
      });
    }),
  );

  // reviews an usher has received (Review.revieweeId is the usher's userId)
  r.get(
    '/ushers/:id/reviews',
    wrap(async (req, res) => {
      const usher = await prisma.usher.findUniqueOrThrow({
        where: { id: String(req.params.id) },
        select: { userId: true },
      });
      const reviews = await prisma.review.findMany({
        where: { revieweeId: usher.userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          // Never select reviewer.phone — it would leak as the public reviewer
          // name below. Only the chosen display names are safe to surface.
          reviewer: { select: { client: { select: { displayName: true } }, usher: { select: { displayName: true } } } },
        },
      });
      res.json(
        reviews.map((rv) => ({
          id: rv.id,
          rating: rv.rating,
          comment: rv.comment,
          createdAt: rv.createdAt,
          reviewerName: rv.reviewer.client?.displayName ?? rv.reviewer.usher?.displayName ?? 'HireQuick user',
        })),
      );
    }),
  );

  return r;
}
