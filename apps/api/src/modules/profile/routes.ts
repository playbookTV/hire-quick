/**
 * Profile + usher verification (TRD §24, UXRD §7). Verification accepts already
 * uploaded signed-URL assets (ID + selfie); the storage layer (Backblaze B2/S3)
 * issues those URLs — stubbed as direct URLs until storage creds are wired.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '@hq/database';
import { ApiError } from '../../app.js';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';

type Handler = (req: AuthedRequest, res: Response) => Promise<void>;
const wrap =
  (h: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    h(req as AuthedRequest, res).catch(next);
  };

const patchMeSchema = z.object({
  displayName: z.string().min(2).max(120).optional(),
  bio: z.string().max(2000).optional(),
  yearsExperience: z.number().int().min(0).max(60).optional(),
});

const verificationSchema = z.object({
  idDocumentUrl: z.string().url(),
  selfieUrl: z.string().url(),
});

export function profileRouter(): Router {
  const r = Router();
  r.use(requireAuth);

  r.get(
    '/',
    wrap(async (req, res) => {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.auth.userId },
        include: { client: true, usher: { include: { wallet: true } } },
      });
      res.json({
        id: user.id,
        role: user.role,
        phone: user.phone,
        email: user.email,
        status: user.status,
        client: user.client,
        usher: user.usher,
      });
    }),
  );

  r.patch(
    '/',
    wrap(async (req, res) => {
      const body = patchMeSchema.parse(req.body);
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.auth.userId },
        include: { client: true, usher: true },
      });
      if (user.client && body.displayName) {
        await prisma.client.update({ where: { id: user.client.id }, data: { displayName: body.displayName } });
      }
      if (user.usher && (body.bio !== undefined || body.yearsExperience !== undefined)) {
        const data: { bio?: string; yearsExperience?: number } = {};
        if (body.bio !== undefined) data.bio = body.bio;
        if (body.yearsExperience !== undefined) data.yearsExperience = body.yearsExperience;
        await prisma.usher.update({ where: { id: user.usher.id }, data });
      }
      res.json({ updated: true });
    }),
  );

  r.post(
    '/verification',
    wrap(async (req, res) => {
      const usher = await prisma.usher.findFirst({ where: { userId: req.auth.userId } });
      if (!usher) throw new ApiError(403, 'NOT_AN_USHER', 'only ushers submit verification');
      const body = verificationSchema.parse(req.body);
      const v = await prisma.usherVerification.create({
        data: { usherId: usher.id, idDocumentUrl: body.idDocumentUrl, selfieUrl: body.selfieUrl, status: 'PENDING' },
      });
      res.status(201).json({ id: v.id, status: v.status });
    }),
  );

  r.get(
    '/verification',
    wrap(async (req, res) => {
      const usher = await prisma.usher.findFirst({ where: { userId: req.auth.userId } });
      if (!usher) throw new ApiError(403, 'NOT_AN_USHER', 'only ushers have verifications');
      const list = await prisma.usherVerification.findMany({
        where: { usherId: usher.id },
        orderBy: { createdAt: 'desc' },
      });
      res.json(list);
    }),
  );

  // register an FCM device token for push notifications
  r.post(
    '/devices',
    wrap(async (req, res) => {
      const { fcmToken, platform } = z
        .object({ fcmToken: z.string().min(8), platform: z.enum(['IOS', 'ANDROID']) })
        .parse(req.body);
      await prisma.deviceToken.upsert({
        where: { fcmToken },
        update: { userId: req.auth.userId, platform, lastSeenAt: new Date() },
        create: { userId: req.auth.userId, fcmToken, platform },
      });
      res.status(201).json({ registered: true });
    }),
  );

  return r;
}
