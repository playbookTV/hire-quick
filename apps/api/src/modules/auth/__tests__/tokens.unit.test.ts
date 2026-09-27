import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { env } from '../../../env.js';
import { signRefreshToken, verifyRefreshToken } from '../tokens.js';

const secret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);
function validClaims() {
  return {
    typ: 'refresh',
    sub: randomUUID(),
    jti: randomUUID(),
    exp: Math.floor(Date.now() / 1000) + 120,
  };
}

describe('refresh JWT boundary', () => {
  it('accepts a signed refresh token with explicit subject, id and expiry', async () => {
    const userId = randomUUID();
    const claims = await verifyRefreshToken(await signRefreshToken(userId));
    expect(claims.userId).toBe(userId);
    expect(claims.jti).toMatch(/^[a-f0-9-]{36}$/);
    expect(claims.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it.each(['typ', 'sub', 'jti', 'exp'] as const)(
    'rejects a signed token missing %s',
    async (field) => {
      const claims: Record<string, unknown> = validClaims();
      delete claims[field];
      const token = await new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).sign(secret);
      await expect(verifyRefreshToken(token)).rejects.toThrow();
    },
  );

  it.each([
    { typ: 'access' },
    { sub: 'undefined' },
    { jti: '' },
    { exp: Math.floor(Date.now() / 1000) - 10 },
  ])('rejects invalid refresh claims %j', async (invalid) => {
    const token = await new SignJWT({ ...validClaims(), ...invalid })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(secret);
    await expect(verifyRefreshToken(token)).rejects.toThrow();
  });

  it('rejects a token signed with a different algorithm', async () => {
    const token = await new SignJWT(validClaims())
      .setProtectedHeader({ alg: 'HS384' })
      .sign(secret);
    await expect(verifyRefreshToken(token)).rejects.toThrow();
  });
});
