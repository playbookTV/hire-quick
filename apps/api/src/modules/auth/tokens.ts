import { SignJWT, jwtVerify } from 'jose';
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
  return new SignJWT({ typ: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(now() + env.JWT_REFRESH_TTL)
    .sign(refreshSecret);
}

export async function verifyAccessToken(token: string): Promise<{ userId: string; role: UserRole }> {
  const { payload } = await jwtVerify(token, accessSecret);
  return { userId: String(payload.sub), role: payload.role as UserRole };
}

export async function verifyRefreshToken(token: string): Promise<{ userId: string }> {
  const { payload } = await jwtVerify(token, refreshSecret);
  return { userId: String(payload.sub) };
}
