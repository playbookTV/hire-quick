import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '@hq/database';
import { CLIENT_ACCOUNT_TYPES } from '@hq/shared';
import { ApiError } from '../../app.js';
import { requireAuth, requireRole, type AuthedRequest } from '../auth/middleware.js';
import { issueUpload } from '../storage/uploads.js';
import { presignDoc, type StoragePort } from '../storage/storage.js';
import { writeAudit } from '../audit.js';
import type { KycPort } from './port/kyc-port.js';
import {
  chooseClientAccountType,
  submitBusinessVerification,
  refreshBusinessVerification,
  reviewBusinessVerification,
} from './business.js';

const wrap =
  (handler: (req: AuthedRequest, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    void handler(req as AuthedRequest, res).catch(next);
  };
const uploadSchema = z.object({
  contentType: z.enum([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf',
  ]),
  byteSize: z.number().int().positive(),
});

export function businessVerificationRouter(kyc: KycPort, storage?: StoragePort): Router {
  const r = Router();
  r.use(['/account-type', '/business'], requireAuth, requireRole('CLIENT'));
  r.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  r.put(
    '/account-type',
    wrap(async (req, res) => {
      const { accountType } = z
        .object({ accountType: z.enum(CLIENT_ACCOUNT_TYPES) })
        .parse(req.body);
      await chooseClientAccountType(req.auth.userId, accountType);
      res.json({ updated: true });
    }),
  );
  r.get(
    '/business',
    wrap(async (req, res) => {
      const record = await prisma.businessVerification.findFirst({
        where: { client: { userId: req.auth.userId } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          status: true,
          registryStatus: true,
          registeredName: true,
          reviewNote: true,
          createdAt: true,
        },
      });
      res.json({ verification: record });
    }),
  );
  r.post(
    '/business/upload-url',
    wrap(async (req, res) => {
      if (!storage)
        throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'Document storage is unavailable.');
      const client = await prisma.client.findUniqueOrThrow({ where: { userId: req.auth.userId } });
      if (client.accountType !== 'BUSINESS' || client.verificationStatus !== 'VERIFIED')
        throw new ApiError(
          403,
          'IDENTITY_REQUIRED',
          'Verify your identity before submitting business evidence.',
        );
      const input = uploadSchema.parse(req.body);
      const extensions = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/heic': 'heic',
        'image/heif': 'heif',
        'application/pdf': 'pdf',
      } as const;
      res.status(201).json(
        await issueUpload(storage, {
          ...input,
          key: `verifications/${client.id}/business-${randomUUID()}.${extensions[input.contentType]}`,
          ownerId: req.auth.userId,
          scopeId: client.id,
          purpose: 'business-authorization',
        }),
      );
    }),
  );
  r.post(
    '/business',
    wrap(async (req, res) => {
      const record = await submitBusinessVerification(req.auth.userId, req.body, kyc);
      res
        .status(202)
        .json({ id: record.id, status: record.status, registryStatus: record.registryStatus });
    }),
  );
  return r;
}

export function adminBusinessVerificationRouter(
  kyc: KycPort | undefined,
  storage?: StoragePort,
): Router {
  const r = Router();
  r.use(requireAuth, requireRole('ADMIN'));
  r.get(
    '/business-verifications',
    wrap(async (req, res) => {
      const status = z
        .enum(['PENDING', 'APPROVED', 'REJECTED'])
        .catch('PENDING')
        .parse(req.query.status);
      const records = await prisma.businessVerification.findMany({
        where: { status },
        orderBy: { createdAt: 'asc' },
        include: {
          client: {
            select: {
              displayName: true,
              verificationStatus: true,
              verifications: {
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                take: 1,
                select: { id: true },
              },
            },
          },
        },
      });
      res.setHeader('Cache-Control', 'no-store');
      await writeAudit({
        actorId: req.auth.userId,
        action: 'business_verification.read',
        target: status,
        metadata: { count: records.length },
      });
      res.json(
        await Promise.all(
          records.map(async ({ authorizationKey, ...record }) => ({
            ...record,
            authorizationUrl: authorizationKey ? await presignDoc(storage, authorizationKey) : null,
          })),
        ),
      );
    }),
  );
  r.post(
    '/business-verifications/:id/refresh',
    wrap(async (req, res) => {
      if (!kyc) throw new ApiError(503, 'KYB_UNAVAILABLE', 'Business verification is unavailable.');
      const id = z.string().uuid().parse(req.params.id);
      await refreshBusinessVerification(id, kyc);
      await writeAudit({
        actorId: req.auth.userId,
        action: 'business_verification.refresh',
        target: id,
      });
      res.json({ updated: true });
    }),
  );
  r.post(
    '/business-verifications/:id/review',
    wrap(async (req, res) => {
      const input = z
        .object({
          decision: z.enum(['APPROVED', 'REJECTED']),
          note: z.string().trim().min(10).max(1000),
          authorityConfirmed: z.boolean().default(false),
        })
        .parse(req.body);
      await reviewBusinessVerification({
        ...input,
        id: z.string().uuid().parse(req.params.id),
        adminId: req.auth.userId,
      });
      res.json({ updated: true });
    }),
  );
  return r;
}
