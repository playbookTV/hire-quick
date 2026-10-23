import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma, type Client } from '@hq/database';
import { clientCanHire } from '@hq/shared';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';
import { presignDoc, type StoragePort } from '../storage/storage.js';
import { ApiError } from '../../app.js';

export async function clientProfile(client: Client, storage?: StoragePort) {
  const [jobsPosted, activeJobs, avatarUrl] = await Promise.all([
    prisma.event.count({ where: { clientId: client.id, status: { not: 'DRAFT' } } }),
    prisma.event.count({
      where: {
        clientId: client.id,
        status: { in: ['OPEN', 'PARTIALLY_STAFFED', 'FULLY_STAFFED', 'IN_PROGRESS'] },
      },
    }),
    client.avatarKey ? presignDoc(storage, client.avatarKey) : null,
  ]);
  return {
    id: client.id,
    displayName: client.displayName,
    businessName: client.businessName,
    description: client.description,
    position: client.position,
    city: client.city,
    ratingAvg: client.ratingAvg,
    ratingCount: client.ratingCount,
    accountType: client.accountType,
    verificationStatus: client.verificationStatus,
    businessVerificationStatus: client.businessVerificationStatus,
    jobsPosted,
    activeJobs,
    avatarUrl,
  };
}

export function clientsRouter(storage?: StoragePort): Router {
  const r = Router();
  r.use(requireAuth);
  r.get('/clients/:id', (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      const id = z.string().uuid().parse(req.params.id);
      const client = await prisma.client.findUnique({
        where: { id },
        include: { user: { select: { status: true } } },
      });
      const auth = (req as AuthedRequest).auth;
      if (
        !client ||
        (auth.userId !== client.userId &&
          auth.role !== 'ADMIN' &&
          (!clientCanHire(client) || client.user.status !== 'ACTIVE'))
      )
        throw new ApiError(404, 'NOT_FOUND', 'Client profile not found.');
      res.json(await clientProfile(client, storage));
    })().catch(next);
  });
  return r;
}
