/**
 * Profile + usher verification (TRD §24, UXRD §7). When object storage is
 * configured, KYC documents are uploaded via server-issued presigned URLs and
 * stored as server-owned bucket keys (not client URLs); reads return short-lived
 * presigned GET URLs. With storage unconfigured (dev/test) the legacy
 * URL-passthrough behavior is preserved.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '@hq/database';
import { setAvailabilitySchema, MAX_PORTFOLIO_PHOTOS } from '@hq/shared';
import { ApiError } from '../../app.js';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';
import { writeAudit } from '../audit.js';
import {
  type StoragePort,
  verificationKey,
  ownsVerificationKey,
  photoKey,
  ownsPhotoKey,
  presignDoc,
} from '../storage/storage.js';

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
  // Client-only.
  businessName: z.string().max(120).optional(),
  // Usher-only discovery fields. `dayRateKobo` is display + filter sugar only —
  // it never feeds escrow/order math (that stays Event.budgetPerHead, TRD §6).
  city: z.string().max(80).optional(),
  languages: z.array(z.string().min(1).max(40)).max(10).optional(),
  dayRateKobo: z.number().int().min(0).max(100_000_000).optional(),
});

// When storage is on these are bucket keys; when off, legacy URLs. Validated
// against the caller's own prefix below before persisting.
const verificationSchema = z.object({
  idDocumentUrl: z.string().min(1),
  selfieUrl: z.string().min(1),
});

// Allowlist upload content types and derive the file extension server-side.
// Accepting an arbitrary contentType/ext lets a caller mint a presigned PUT for
// text/html or image/svg+xml; that object is later served from the bucket to
// admins (KYC) and clients (avatars) and would execute as stored XSS. Raster
// images + PDF (KYC only) don't run script.
// Raster image formats the mobile picker can emit (incl. iOS HEIC) — none of
// these execute script. SVG and any text/* or application/* (except PDF for KYC)
// are deliberately excluded.
const PHOTO_CONTENT_TYPES = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
} as const;
const KYC_CONTENT_TYPES = { ...PHOTO_CONTENT_TYPES, 'application/pdf': 'pdf' } as const;

const uploadUrlSchema = z.object({
  kind: z.enum(['id', 'selfie']),
  contentType: z.enum(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']),
});

// Profile photo + portfolio (UXRD §7). Same presigned-key flow as verification.
const photoUploadUrlSchema = z.object({
  kind: z.enum(['avatar', 'portfolio']),
  contentType: z.enum(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
});

const photoKeySchema = z.object({ key: z.string().min(1) });

export function profileRouter(storage?: StoragePort): Router {
  const r = Router();
  r.use(requireAuth);

  r.get(
    '/',
    wrap(async (req, res) => {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.auth.userId },
        include: {
          client: true,
          usher: {
            include: {
              wallet: true,
              milestones: { include: { tier: true }, orderBy: { unlockedAt: 'desc' } },
            },
          },
        },
      });
      // Enrich the usher with a presigned avatar URL + portfolio photos so the
      // app can render real images (falls back to initials when avatarKey null).
      let usher = null;
      if (user.usher) {
        const photos = await prisma.photo.findMany({
          where: { usherId: user.usher.id },
          orderBy: { createdAt: 'asc' },
        });
        usher = {
          ...user.usher,
          avatarUrl: user.usher.avatarKey ? await presignDoc(storage, user.usher.avatarKey) : null,
          portfolio: await Promise.all(
            photos.map(async (p) => ({ id: p.id, imageUrl: await presignDoc(storage, p.imageUrl) })),
          ),
        };
      }
      res.json({
        id: user.id,
        role: user.role,
        phone: user.phone,
        email: user.email,
        status: user.status,
        client: user.client,
        usher,
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
      if (user.client && (body.displayName !== undefined || body.businessName !== undefined)) {
        const data: { displayName?: string; businessName?: string } = {};
        if (body.displayName !== undefined) data.displayName = body.displayName;
        if (body.businessName !== undefined) data.businessName = body.businessName;
        await prisma.client.update({ where: { id: user.client.id }, data });
      }
      if (
        user.usher &&
        (body.bio !== undefined ||
          body.yearsExperience !== undefined ||
          body.displayName !== undefined ||
          body.city !== undefined ||
          body.languages !== undefined ||
          body.dayRateKobo !== undefined)
      ) {
        const data: {
          bio?: string;
          yearsExperience?: number;
          displayName?: string;
          city?: string;
          languages?: string[];
          dayRateKobo?: number;
        } = {};
        if (body.bio !== undefined) data.bio = body.bio;
        if (body.yearsExperience !== undefined) data.yearsExperience = body.yearsExperience;
        if (body.displayName !== undefined) data.displayName = body.displayName;
        if (body.city !== undefined) data.city = body.city;
        if (body.languages !== undefined) data.languages = body.languages;
        if (body.dayRateKobo !== undefined) data.dayRateKobo = body.dayRateKobo;
        await prisma.usher.update({ where: { id: user.usher.id }, data });
      }
      res.json({ updated: true });
    }),
  );

  // Mint a presigned PUT to a server-owned key. Client uploads the bytes
  // directly, then submits the returned key to POST /verification.
  r.post(
    '/verification/upload-url',
    wrap(async (req, res) => {
      if (!storage) throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'document storage not configured');
      const usher = await prisma.usher.findFirst({ where: { userId: req.auth.userId } });
      if (!usher) throw new ApiError(403, 'NOT_AN_USHER', 'only ushers submit verification');
      const { kind, contentType } = uploadUrlSchema.parse(req.body);
      const key = verificationKey(usher.id, kind, KYC_CONTENT_TYPES[contentType]);
      const url = await storage.presignUpload(key, contentType);
      res.status(201).json({ url, key });
    }),
  );

  r.post(
    '/verification',
    wrap(async (req, res) => {
      const usher = await prisma.usher.findFirst({ where: { userId: req.auth.userId } });
      if (!usher) throw new ApiError(403, 'NOT_AN_USHER', 'only ushers submit verification');
      const body = verificationSchema.parse(req.body);
      // With storage on, documents must be server-issued keys under the caller's
      // own prefix — never an arbitrary client-supplied URL.
      if (storage && (!ownsVerificationKey(usher.id, body.idDocumentUrl) || !ownsVerificationKey(usher.id, body.selfieUrl))) {
        throw new ApiError(400, 'INVALID_DOCUMENT_KEY', 'documents must be uploaded via /verification/upload-url');
      }
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
      await writeAudit({
        actorId: req.auth.userId,
        action: 'verification.read.self',
        target: usher.id,
        metadata: { count: list.length },
      });
      const resolved = await Promise.all(
        list.map(async (v) => ({
          ...v,
          idDocumentUrl: await presignDoc(storage, v.idDocumentUrl),
          selfieUrl: await presignDoc(storage, v.selfieUrl),
        })),
      );
      res.json(resolved);
    }),
  );

  // Mint a presigned PUT URL for a profile/portfolio photo (same flow as KYC):
  // the app PUTs bytes straight to storage, then submits the returned key.
  r.post(
    '/photos/upload-url',
    wrap(async (req, res) => {
      if (!storage) throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'photo storage not configured');
      const usher = await prisma.usher.findFirst({ where: { userId: req.auth.userId } });
      if (!usher) throw new ApiError(403, 'NOT_AN_USHER', 'only ushers upload photos');
      const { kind, contentType } = photoUploadUrlSchema.parse(req.body);
      const key = photoKey(usher.id, kind, PHOTO_CONTENT_TYPES[contentType]);
      const url = await storage.presignUpload(key, contentType);
      res.status(201).json({ url, key });
    }),
  );

  // Set (or replace) the profile photo. Best-effort delete of the old object.
  r.put(
    '/photos/avatar',
    wrap(async (req, res) => {
      const usher = await prisma.usher.findFirst({ where: { userId: req.auth.userId } });
      if (!usher) throw new ApiError(403, 'NOT_AN_USHER', 'only ushers have a profile photo');
      const { key } = photoKeySchema.parse(req.body);
      if (storage && !ownsPhotoKey(usher.id, key)) {
        throw new ApiError(400, 'INVALID_PHOTO_KEY', 'photo must be uploaded via /photos/upload-url');
      }
      if (storage && usher.avatarKey && usher.avatarKey !== key) {
        await storage.deleteObject(usher.avatarKey).catch(() => undefined);
      }
      await prisma.usher.update({ where: { id: usher.id }, data: { avatarKey: key } });
      await writeAudit({ actorId: req.auth.userId, action: 'usher.avatar.set', target: usher.id });
      res.json({ avatarUrl: await presignDoc(storage, key) });
    }),
  );

  // Add a portfolio photo (max 5).
  r.post(
    '/photos/portfolio',
    wrap(async (req, res) => {
      const usher = await prisma.usher.findFirst({ where: { userId: req.auth.userId } });
      if (!usher) throw new ApiError(403, 'NOT_AN_USHER', 'only ushers have a portfolio');
      const { key } = photoKeySchema.parse(req.body);
      if (storage && !ownsPhotoKey(usher.id, key)) {
        throw new ApiError(400, 'INVALID_PHOTO_KEY', 'photo must be uploaded via /photos/upload-url');
      }
      const count = await prisma.photo.count({ where: { usherId: usher.id } });
      if (count >= MAX_PORTFOLIO_PHOTOS) {
        throw new ApiError(409, 'PHOTO_LIMIT', `portfolio is limited to ${MAX_PORTFOLIO_PHOTOS} photos`);
      }
      const photo = await prisma.photo.create({ data: { usherId: usher.id, imageUrl: key } });
      await writeAudit({ actorId: req.auth.userId, action: 'usher.portfolio.add', target: photo.id });
      res.status(201).json({ id: photo.id, imageUrl: await presignDoc(storage, photo.imageUrl) });
    }),
  );

  // Remove a portfolio photo the caller owns.
  r.delete(
    '/photos/portfolio/:id',
    wrap(async (req, res) => {
      const usher = await prisma.usher.findFirst({ where: { userId: req.auth.userId } });
      if (!usher) throw new ApiError(403, 'NOT_AN_USHER', 'only ushers have a portfolio');
      const photo = await prisma.photo.findUnique({ where: { id: String(req.params.id) } });
      if (!photo || photo.usherId !== usher.id) {
        throw new ApiError(404, 'PHOTO_NOT_FOUND', 'photo not found');
      }
      if (storage) await storage.deleteObject(photo.imageUrl).catch(() => undefined);
      await prisma.photo.delete({ where: { id: photo.id } });
      await writeAudit({ actorId: req.auth.userId, action: 'usher.portfolio.remove', target: photo.id });
      res.json({ deleted: true });
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
      // Registering a device is the consent signal for push (NDPR). Record it
      // explicitly, but don't clobber a prior withdrawal — re-registering only
      // (re)grants when not already on record as granted.
      await prisma.consentRecord.upsert({
        where: { userId_purpose: { userId: req.auth.userId, purpose: 'PUSH_NOTIFICATIONS' } },
        update: { granted: true, withdrawnAt: null, grantedAt: new Date() },
        create: { userId: req.auth.userId, purpose: 'PUSH_NOTIFICATIONS', granted: true, source: 'EXPLICIT' },
      });
      res.status(201).json({ registered: true });
    }),
  );

  // usher availability calendar — list a date range
  r.get(
    '/availability',
    wrap(async (req, res) => {
      const usher = await prisma.usher.findFirst({ where: { userId: req.auth.userId } });
      if (!usher) throw new ApiError(403, 'NOT_AN_USHER', 'only ushers have availability');
      const q = z
        .object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })
        .parse(req.query);
      const where: { usherId: string; date?: { gte?: Date; lte?: Date } } = { usherId: usher.id };
      if (q.from || q.to) {
        where.date = {};
        if (q.from) where.date.gte = new Date(q.from);
        if (q.to) where.date.lte = new Date(q.to);
      }
      res.json(await prisma.availability.findMany({ where, orderBy: { date: 'asc' } }));
    }),
  );

  // usher marks a single day available / unavailable (upsert on usherId+date)
  r.put(
    '/availability',
    wrap(async (req, res) => {
      const usher = await prisma.usher.findFirst({ where: { userId: req.auth.userId } });
      if (!usher) throw new ApiError(403, 'NOT_AN_USHER', 'only ushers set availability');
      const body = setAvailabilitySchema.parse(req.body);
      const date = new Date(body.date);
      const row = await prisma.availability.upsert({
        where: { usherId_date: { usherId: usher.id, date } },
        update: { status: body.status },
        create: { usherId: usher.id, date, status: body.status },
      });
      res.json(row);
    }),
  );

  return r;
}
