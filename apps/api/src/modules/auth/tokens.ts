import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { prisma } from '@hq/database';
import type { UserRole } from '@hq/shared';
import { env } from '../../env.js';

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const refreshSecret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);
const now = (): number => Math.floor(Date.now() / 1000);

export async function signAccessToken(userId: string, role: UserRole): Promise<string> {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(now() + env.JWT_ACCESS_TTL)
    .sign(accessSecret);
}

export async function signRefreshToken(userId: string): Promise<string> {
  // jti gives each refresh token a unique id so it can be denylisted on logout
  // and on rotation (single-use). Without it there is nothing to revoke.
  return new SignJWT({ typ: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(now() + env.JWT_REFRESH_TTL)
    .sign(refreshSecret);
}

export async function verifyAccessToken(token: string): Promise<{ userId: string; role: UserRole }> {
  const { payload } = await jwtVerify(token, accessSecret);
  return { userId: String(payload.sub), role: payload.role as UserRole };
}

export async function verifyRefreshToken(token: string): Promise<{ userId: string; jti: string; expiresAt: Date }> {
  const { payload } = await jwtVerify(token, refreshSecret);
  if (!payload.jti) throw new Error('refresh token missing jti');
  return { userId: String(payload.sub), jti: payload.jti, expiresAt: new Date((payload.exp ?? now()) * 1000) };
}

/**
 * Add a refresh token's jti to the denylist (idempotent). Used by logout and by
 * refresh-rotation to burn a consumed token. Returns the owning userId, or null
 * when the token can't be verified (so logout stays idempotent for junk input).
 * Denylist rows expire with the token and are dropped by the retention purge.
 */
export async function revokeRefreshToken(token: string): Promise<{ userId: string } | null> {
  let claims: { userId: string; jti: string; expiresAt: Date };
  try {
    claims = await verifyRefreshToken(token);
  } catch {
    return null;
  }
  await prisma.revokedToken.upsert({
    where: { jti: claims.jti },
    update: {},
    create: { jti: claims.jti, userId: claims.userId, expiresAt: claims.expiresAt },
  });
  return { userId: claims.userId };
}
