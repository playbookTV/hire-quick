/**
 * Push delivery over Expo: consent and category gates, idempotent dispatch rows,
 * the device/preference/open endpoints, ticket bookkeeping and receipt pruning.
 * DB-backed; the Expo API is replaced by an injected `post`.
 */
import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@hq/database';
import { createApp } from '../../../app.js';
import { signAccessToken, signRefreshToken } from '../../auth/tokens.js';
import { assertDisposableDatabase } from '../../auth/__tests__/assert-disposable-db.js';
import { setConsent } from '../../privacy/consent.js';
import { buildExport } from '../../privacy/service.js';
import { clearSentNotifications, sentNotifications } from '../brevo.js';
import { deliverPush } from '../service.js';
import { checkPushReceipts, deliverForTest, type ExpoPost, type PushMessage } from '../push.js';

const app = createApp();
const users: string[] = [];
let isolated = false;
beforeAll(async () => {
  await assertDisposableDatabase();
  isolated = true;
});
afterEach(async () => {
  if (!isolated) return;
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  users.length = 0;
  clearSentNotifications();
});

const pushToken = () => `ExponentPushToken[${randomUUID()}]`;
const message = (overrides: Partial<PushMessage> = {}): PushMessage => ({
  type: 'BOOKING_CONFIRMED',
  title: "You've been booked",
  body: 'Open HireQuick for details.',
  channel: 'bookings',
  target: { targetType: 'booking', targetId: randomUUID() },
  ...overrides,
});

async function fixture(options: { consent?: boolean; device?: boolean } = {}) {
  const user = await prisma.user.create({
    data: { phone: `push-${randomUUID()}`, role: 'USHER', status: 'ACTIVE' },
  });
  users.push(user.id);
  if (options.consent ?? true) await setConsent(user.id, 'PUSH_NOTIFICATIONS', true);
  const device =
    (options.device ?? true)
      ? await prisma.deviceToken.create({ data: { userId: user.id, token: pushToken(), platform: 'ANDROID' } })
      : null;
  return { userId: user.id, device, auth: `Bearer ${await signAccessToken(user.id, 'USHER')}` };
}

describe('push gates and dispatch log', () => {
  it('sends once per user and records the dispatch with its target', async () => {
    const f = await fixture();
    const m = message();
    await deliverPush(f.userId, m);
    expect(sentNotifications()).toEqual([{ kind: 'push', to: f.device!.token, summary: m.body }]);
    const rows = await prisma.notificationDispatch.findMany({ where: { userId: f.userId } });
    expect(rows).toEqual([
      expect.objectContaining({
        kind: 'BOOKING_CONFIRMED',
        targetType: 'booking',
        targetId: m.target!.targetId,
        dedupeKey: null,
        openedAt: null,
      }),
    ]);
  });

  it('skips a keyed send that already happened', async () => {
    const f = await fixture();
    const key = `reminder:${randomUUID()}`;
    await deliverPush(f.userId, message(), key);
    await deliverPush(f.userId, message(), key);
    expect(sentNotifications()).toHaveLength(1);
    expect(await prisma.notificationDispatch.count({ where: { userId: f.userId } })).toBe(1);
  });

  it('records nothing without consent or without a device', async () => {
    const noConsent = await fixture({ consent: false });
    const noDevice = await fixture({ device: false });
    await deliverPush(noConsent.userId, message());
    await deliverPush(noDevice.userId, message());
    expect(sentNotifications()).toEqual([]);
    expect(
      await prisma.notificationDispatch.count({ where: { userId: { in: [noConsent.userId, noDevice.userId] } } }),
    ).toBe(0);
  });

  it('sends nothing to an account that is no longer active', async () => {
    const f = await fixture();
    await prisma.user.update({ where: { id: f.userId }, data: { status: 'SUSPENDED' } });
    await deliverPush(f.userId, message());
    expect(sentNotifications()).toEqual([]);
    expect(await prisma.notificationDispatch.count({ where: { userId: f.userId } })).toBe(0);
  });

  it('honours category switches but keeps bookings and payments on', async () => {
    const f = await fixture();
    await prisma.notificationPreference.create({
      data: { userId: f.userId, messages: false, reminders: false, jobAlerts: false },
    });
    await deliverPush(f.userId, message({ type: 'NEW_MESSAGE', channel: 'messages' }));
    await deliverPush(f.userId, message({ type: 'REMINDER', channel: 'reminders' }));
    await deliverPush(f.userId, message({ type: 'JOB_ALERT', channel: 'job_alerts' }));
    expect(sentNotifications()).toEqual([]);
    await deliverPush(f.userId, message());
    expect(sentNotifications()).toHaveLength(1);
  });
});

describe('device, preference and open endpoints', () => {
  it('registers only Expo tokens and unregisters only the caller’s device', async () => {
    const f = await fixture({ device: false });
    const other = await fixture();
    const bad = await request(app)
      .post('/api/me/devices')
      .set('Authorization', f.auth)
      .send({ token: 'fcm-registration-token', platform: 'ANDROID' });
    expect(bad.status).toBe(400);
    const token = pushToken();
    const ok = await request(app).post('/api/me/devices').set('Authorization', f.auth).send({ token, platform: 'IOS' });
    expect(ok.status).toBe(201);

    const foreign = await request(app)
      .post('/api/me/devices/unregister')
      .set('Authorization', f.auth)
      .send({ token: other.device!.token });
    expect(foreign.body).toEqual({ removed: false });
    expect(await prisma.deviceToken.count({ where: { userId: other.userId } })).toBe(1);

    const mine = await request(app).post('/api/me/devices/unregister').set('Authorization', f.auth).send({ token });
    expect(mine.body).toEqual({ removed: true });
    expect(await prisma.deviceToken.count({ where: { userId: f.userId } })).toBe(0);
  });

  it('removes the caller’s device at logout when the app could not unregister it', async () => {
    const f = await fixture();
    const other = await fixture();
    const logout = async (pushToken: string) =>
      request(app).post('/auth/logout').send({ refreshToken: await signRefreshToken(f.userId), pushToken });

    // Another account's device is never removed through this account's logout.
    expect((await logout(other.device!.token)).status).toBe(204);
    expect(await prisma.deviceToken.count({ where: { userId: other.userId } })).toBe(1);
    expect((await logout('not-an-expo-token')).status).toBe(204);
    expect(await prisma.deviceToken.count({ where: { userId: f.userId } })).toBe(1);

    expect((await logout(f.device!.token)).status).toBe(204);
    expect(await prisma.deviceToken.count({ where: { userId: f.userId } })).toBe(0);
  });

  it('defaults every category on and stores partial updates', async () => {
    const f = await fixture();
    const initial = await request(app).get('/api/me/notification-preferences').set('Authorization', f.auth);
    expect(initial.body).toEqual({ jobAlerts: true, reminders: true, messages: true });
    const updated = await request(app)
      .put('/api/me/notification-preferences')
      .set('Authorization', f.auth)
      .send({ messages: false });
    expect(updated.body).toEqual({ jobAlerts: true, reminders: true, messages: false });
    const again = await request(app)
      .put('/api/me/notification-preferences')
      .set('Authorization', f.auth)
      .send({ jobAlerts: false });
    expect(again.body).toEqual({ jobAlerts: false, reminders: true, messages: false });
    const empty = await request(app).put('/api/me/notification-preferences').set('Authorization', f.auth).send({});
    expect(empty.status).toBe(400);
  });

  it('records the first open of the caller’s own dispatch only', async () => {
    const f = await fixture();
    const other = await fixture();
    await deliverPush(f.userId, message());
    const dispatch = await prisma.notificationDispatch.findFirstOrThrow({ where: { userId: f.userId } });
    const path = `/api/me/notification-dispatches/${dispatch.id}/opened`;

    expect((await request(app).post(path).set('Authorization', other.auth).send({ action: 'open' })).status).toBe(404);
    expect((await request(app).post(path).set('Authorization', f.auth).send({ action: 'accept' })).status).toBe(400);
    expect(
      (await request(app).post('/api/me/notification-dispatches/not-a-uuid/opened').set('Authorization', f.auth).send({ action: 'open' }))
        .status,
    ).toBe(404);

    expect((await request(app).post(path).set('Authorization', f.auth).send({ action: 'view' })).body).toEqual({ opened: true });
    await request(app).post(path).set('Authorization', f.auth).send({ action: 'open' });
    const opened = await prisma.notificationDispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
    expect(opened.action).toBe('view');
    expect(opened.openedAt).toBeInstanceOf(Date);
  });

  it('exports the caller’s preferences and dispatch log', async () => {
    const f = await fixture();
    await prisma.notificationPreference.create({ data: { userId: f.userId, reminders: false } });
    await deliverPush(f.userId, message());
    const exported = await buildExport(f.userId);
    expect(exported.notificationPreference).toEqual(expect.objectContaining({ reminders: false }));
    expect(exported.notificationDispatches).toEqual([expect.objectContaining({ kind: 'BOOKING_CONFIRMED' })]);
  });
});

describe('Expo tickets and receipts', () => {
  it('sends the lock-screen message with its data, keeps ok tickets and drops gone devices', async () => {
    const f = await fixture();
    const gone = await prisma.deviceToken.create({ data: { userId: f.userId, token: pushToken(), platform: 'IOS' } });
    const calls: unknown[] = [];
    const ticketId = `ticket-${randomUUID()}`;
    const post: ExpoPost = async (url, body) => {
      calls.push({ url, body });
      return Promise.resolve({
        data: [
          { status: 'ok', id: ticketId },
          { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
        ],
      });
    };
    const dispatchId = randomUUID();
    const m = message({ categoryId: 'invitation', collapseId: 'chat:b-1', timeSensitive: true });
    await deliverForTest(
      [
        { id: f.device!.id, token: f.device!.token },
        { id: gone.id, token: gone.token },
      ],
      m,
      dispatchId,
      post,
    );
    expect(calls).toEqual([
      {
        url: 'https://exp.host/--/api/v2/push/send',
        body: [
          {
            to: f.device!.token,
            title: m.title,
            body: m.body,
            data: { type: m.type, dispatchId, ...m.target },
            sound: 'default',
            channelId: 'bookings',
            priority: 'high',
            categoryId: 'invitation',
            collapseId: 'chat:b-1',
            interruptionLevel: 'time-sensitive',
          },
          expect.objectContaining({ to: gone.token }),
        ],
      },
    ]);
    expect(await prisma.pushTicket.findMany({ where: { id: ticketId } })).toEqual([
      expect.objectContaining({ deviceTokenId: f.device!.id }),
    ]);
    expect(await prisma.deviceToken.findUnique({ where: { id: gone.id } })).toBeNull();
  });

  it('sends in batches of 100', async () => {
    const devices = Array.from({ length: 150 }, (_, i) => ({ id: randomUUID(), token: `ExponentPushToken[batch-${String(i)}]` }));
    const sizes: number[] = [];
    const post: ExpoPost = async (_url, body) => {
      sizes.push((body as unknown[]).length);
      return Promise.resolve({ data: [] });
    };
    await deliverForTest(devices, message(), randomUUID(), post);
    expect(sizes).toEqual([100, 50]);
  });

  it('prunes devices from receipts, waits for unpublished ones and expires old tickets', async () => {
    const f = await fixture();
    const stale = await prisma.deviceToken.create({ data: { userId: f.userId, token: pushToken(), platform: 'IOS' } });
    const now = new Date();
    const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
    const [delivered, unregistered, pending, fresh, expired] = await Promise.all([
      prisma.pushTicket.create({ data: { id: `r-ok-${randomUUID()}`, deviceTokenId: f.device!.id, createdAt: minutesAgo(20) } }),
      prisma.pushTicket.create({ data: { id: `r-gone-${randomUUID()}`, deviceTokenId: stale.id, createdAt: minutesAgo(20) } }),
      prisma.pushTicket.create({ data: { id: `r-wait-${randomUUID()}`, deviceTokenId: f.device!.id, createdAt: minutesAgo(30) } }),
      prisma.pushTicket.create({ data: { id: `r-new-${randomUUID()}`, deviceTokenId: f.device!.id, createdAt: minutesAgo(5) } }),
      prisma.pushTicket.create({ data: { id: `r-old-${randomUUID()}`, deviceTokenId: f.device!.id, createdAt: minutesAgo(25 * 60) } }),
    ]);
    const asked: string[][] = [];
    const post: ExpoPost = async (url, body) => {
      expect(url).toBe('https://exp.host/--/api/v2/push/getReceipts');
      asked.push((body as { ids: string[] }).ids);
      return Promise.resolve({
        data: {
          [delivered.id]: { status: 'ok' },
          [unregistered.id]: { status: 'error', details: { error: 'DeviceNotRegistered' } },
        },
      });
    };
    const result = await checkPushReceipts({ now, post });
    expect(asked.flat().sort()).toEqual([delivered.id, unregistered.id, pending.id].sort());
    expect(result).toEqual({ checked: 2, pruned: 1, expired: 1 });
    const left = await prisma.pushTicket.findMany({
      where: { id: { in: [delivered.id, unregistered.id, pending.id, fresh.id, expired.id] } },
      select: { id: true },
    });
    expect(left.map((t) => t.id).sort()).toEqual([pending.id, fresh.id].sort());
    expect(await prisma.deviceToken.findUnique({ where: { id: stale.id } })).toBeNull();
    expect(await prisma.deviceToken.findUnique({ where: { id: f.device!.id } })).toBeTruthy();
  });
});
