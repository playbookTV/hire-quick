import { prisma } from '@hq/database';
import { verifySocketAccessToken } from '../modules/auth/tokens.js';

/** No positive cache: every action and private delivery uses current DB evidence. */
export async function authorizeSocketToken(token: string) {
  const claims = await verifySocketAccessToken(token);
  const user = await prisma.user.findUnique({
    where: { id: claims.userId }, select: { status: true, role: true },
  });
  if (!user || user.status !== 'ACTIVE' || user.role !== claims.role)
    throw new Error('socket session unavailable');
  const revoked = await prisma.revokedToken.findUnique({ where: { jti: claims.refreshJti }, select: { jti: true } });
  if (revoked || claims.expiresAt <= Date.now()) throw new Error('socket session unavailable');
  return claims;
}
