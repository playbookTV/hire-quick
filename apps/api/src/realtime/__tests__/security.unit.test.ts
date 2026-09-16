import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { env } from '../../env.js';
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken, verifySocketAccessToken } from '../../modules/auth/tokens.js';
import { chatMessageBody, socketMessageInput, bookingChatScope, seenMessageInput } from '../validation.js';
import { createSocketRateLimiter, SOCKET_RATE_LIMIT, SOCKET_RATE_WINDOW_MS } from '../rate-limit.js';
import { encodePrivateEvent, decodePrivateEvent } from '../fanout.js';

const userId = randomUUID();
const bookingId = randomUUID();

describe('session-bound socket tokens', () => {
  it('binds access to the exact refresh jti while retaining the REST contract', async () => {
    const refresh = await signRefreshToken(userId);
    const access = await signAccessToken(userId, 'CLIENT', refresh);
    expect(await verifyAccessToken(access)).toEqual({ userId, role: 'CLIENT' });
    expect(await verifySocketAccessToken(access)).toMatchObject({ userId, role: 'CLIENT', refreshJti: (await verifyRefreshToken(refresh)).jti });
  });
  it('rejects legacy access on sockets while allowing its existing REST lifetime', async () => {
    const legacy = await signAccessToken(userId, 'CLIENT');
    await expect(verifyAccessToken(legacy)).resolves.toEqual({ userId, role: 'CLIENT' });
    await expect(verifySocketAccessToken(legacy)).rejects.toThrow();
  });
  it('does not bind another account’s refresh token', async () => {
    await expect(signAccessToken(userId, 'CLIENT', await signRefreshToken(randomUUID()))).rejects.toThrow('binding');
  });
  it('cannot outlive refresh/revocation retention', async () => {
    const exp = Math.floor(Date.now() / 1000) + 30;
    const refresh = await new SignJWT({ typ: 'refresh' }).setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId).setJti(randomUUID()).setExpirationTime(exp)
      .sign(new TextEncoder().encode(env.JWT_REFRESH_SECRET));
    const access = await signAccessToken(userId, 'CLIENT', refresh);
    expect((await verifySocketAccessToken(access)).expiresAt).toBeLessThanOrEqual(exp * 1000);
  });
  it.each(['missing-sid', 'invalid-role', 'expired', 'wrong-type'])('rejects signed %s socket claims', async (kind) => {
    const token = await new SignJWT({ typ: kind === 'wrong-type' ? 'refresh' : 'access', role: kind === 'invalid-role' ? 'SUPERUSER' : 'CLIENT', ...(kind === 'missing-sid' ? {} : { sid: randomUUID() }) })
      .setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setExpirationTime(Math.floor(Date.now() / 1000) + (kind === 'expired' ? -1 : 60))
      .sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET));
    await expect(verifySocketAccessToken(token)).rejects.toThrow();
  });
});

describe('shared REST/socket chat bounds', () => {
  it.each([null, [], '', {}, { content: '' }, { content: 123 }, { content: 'x'.repeat(4001) }, { content: 'x', contentType: 'HTML' }, { content: 'x', senderId: userId }])('rejects malformed body on both boundaries', (body) => {
    expect(chatMessageBody.safeParse(body).success).toBe(false);
    expect(socketMessageInput.safeParse({ ...(body && typeof body === 'object' ? body : {}), bookingId }).success).toBe(false);
  });
  it('accepts the maximum text and all recognized content kinds', () => {
    for (const contentType of ['TEXT', 'IMAGE', 'VOICE']) {
      const body = { content: 'x'.repeat(4000), contentType };
      expect(chatMessageBody.safeParse(body).success).toBe(true);
      expect(socketMessageInput.safeParse({ ...body, bookingId }).success).toBe(true);
    }
  });
  it.each(['not-a-uuid', '', null, bookingId + '\n'])('rejects invalid join/typing/seen routing', (id) => {
    expect(bookingChatScope.safeParse({ bookingId: id }).success).toBe(false);
    expect(seenMessageInput.safeParse({ bookingId, upToMessageId: id }).success).toBe(false);
  });
});

describe('bounded socket rate limiter', () => {
  it('shares a quota by user, replenishes after the window, and isolates other users', async () => {
    let now = 100;
    const limiter = createSocketRateLimiter(undefined, () => now);
    for (let i = 0; i < SOCKET_RATE_LIMIT; i++) expect(await limiter.take(userId)).toBe(true);
    expect(await limiter.take(userId)).toBe(false);
    expect(await limiter.take(randomUUID())).toBe(true);
    now += SOCKET_RATE_WINDOW_MS;
    expect(await limiter.take(userId)).toBe(true);
  });
  it('fails closed when the shared Redis counter is unavailable or invalid', async () => {
    await expect(createSocketRateLimiter({ status: 'reconnecting', eval: async () => 1 }).take(userId)).rejects.toThrow();
    await expect(createSocketRateLimiter({ status: 'ready', eval: async () => 'bad' }).take(userId)).rejects.toThrow();
    await expect(createSocketRateLimiter({ status: 'ready', eval: async () => { throw new Error('offline'); } }).take(userId)).rejects.toThrow();
  });
});

describe('private fanout envelope bounds', () => {
  it('roundtrips authorized targets and rejects unknown/oversized/cyclic payloads', () => {
    const envelope = { version: 1 as const, target: { kind: 'user' as const, id: userId }, event: 'event', payload: { value: true } };
    expect(decodePrivateEvent(encodePrivateEvent(envelope)!)).toEqual(envelope);
    expect(decodePrivateEvent('{broken')).toBeNull();
    expect(decodePrivateEvent(JSON.stringify({ ...envelope, target: { kind: 'all' } }))).toBeNull();
    expect(encodePrivateEvent({ ...envelope, payload: 'x'.repeat(65536) })).toBeNull();
    const cycle: { self?: unknown } = {}; cycle.self = cycle;
    expect(encodePrivateEvent({ ...envelope, payload: cycle })).toBeNull();
  });
});
