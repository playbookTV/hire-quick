import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { prisma } from '@hq/database';
import { USER_ROLES, type UserRole } from '@hq/shared';
import { env } from '../../env.js';

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const refreshSecret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);
const now = (): number => Math.floor(Date.now() / 1000);
const refreshClaims = z.object({
  typ: z.literal('refresh'),
  sub: z.string().uuid(),
  jti: z.string().uuid(),
  exp: z.number().int().positive(),
});

export async function signAccessToken(userId: string, role: UserRole, refreshToken?: string): Promise<string> {
  const binding = refreshToken ? await verifyRefreshToken(refreshToken) : undefined;
  if (binding && binding.userId !== userId) throw new Error('invalid access token session binding');
  return new SignJWT({ typ: 'access', role, ...(binding ? { sid: binding.jti } : {}) })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    // Revocation rows expire with refresh tokens; never outlive that evidence.
    .setExpirationTime(Math.min(now() + env.JWT_ACCESS_TTL, binding ? binding.expiresAt.getTime() / 1000 : Infinity))
    .sign(accessSecret);
}

/** REST accepts legacy access tokens until expiry; sockets require revocable binding. */
export async function verifySocketAccessToken(token: string): Promise<{
  userId: string; role: UserRole; refreshJti: string; expiresAt: number;
}> {
  const { payload } = await jwtVerify(token, accessSecret, { algorithms: ['HS256'] });
  const claims = z.object({
    typ: z.literal('access'), sub: z.string().uuid(), role: z.enum(USER_ROLES),
    sid: z.string().uuid(), exp: z.number().int().positive(),
  }).parse(payload);
  return { userId: claims.sub, role: claims.role, refreshJti: claims.sid, expiresAt: claims.exp * 1000 };
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

export async function verifyAccessToken(
  token: string,
): Promise<{ userId: string; role: UserRole }> {
  const { payload } = await jwtVerify(token, accessSecret);
  return { userId: String(payload.sub), role: payload.role as UserRole };
}

export async function verifyRefreshToken(
  token: string,
): Promise<{ userId: string; jti: string; expiresAt: Date }> {
  const { payload } = await jwtVerify(token, refreshSecret, { algorithms: ['HS256'] });
  const claims = refreshClaims.parse(payload);
  return { userId: claims.sub, jti: claims.jti, expiresAt: new Date(claims.exp * 1000) };
}

/**
 * Add a refresh token's jti to the denylist (idempotent). Used by logout;
 * rotation requires a unique transactional claim instead of upsert.
 * Returns the owning userId, or null
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
  // Native ON CONFLICT DO NOTHING also handles a concurrent first rotation or
  // logout. Prisma's empty-update upsert can otherwise race on the jti PK.
  await prisma.revokedToken.createMany({ data: [claims], skipDuplicates: true });
  return { userId: claims.userId };
}
