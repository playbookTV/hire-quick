import type { Request, Response, NextFunction } from 'express';
import { prisma } from '@hq/database';
import { clientCanHire } from '@hq/shared';
import { ApiError } from '../../app.js';
import type { AuthedRequest } from '../auth/middleware.js';

export const publicClientSelect = {
  displayName: true,
  businessName: true,
  accountType: true,
  verificationStatus: true,
  businessVerificationStatus: true,
} as const;

/** Mounted after account/verification routes. Existing booking obligations remain accessible. */
export function requireClientVerification(req: Request, _res: Response, next: NextFunction) {
  const auth = (req as AuthedRequest).auth;
  if (auth.role !== 'CLIENT') {
    next();
    return;
  }
  void (async () => {
    const client = await prisma.client.findUnique({ where: { userId: auth.userId } });
    if (clientCanHire(client)) return;
    if (req.method === 'GET' && req.path === '/bookings') return;
    const bookingPath = /^\/bookings\/([0-9a-f-]{36})(?:\/|$)/i.exec(req.path);
    if (bookingPath && client) {
      const booking = await prisma.booking.findFirst({
        where: { id: bookingPath[1]!, event: { clientId: client.id }, payment: { isNot: null } },
        select: { id: true },
      });
      if (booking) return;
    }
    throw new ApiError(
      403,
      'CLIENT_VERIFICATION_REQUIRED',
      'Complete your account verification before using the marketplace.',
    );
  })()
    .then(() => next())
    .catch(next);
}
