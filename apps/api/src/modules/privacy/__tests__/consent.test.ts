import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@hq/database';
import { createApp } from '../../../app.js';
import { signAccessToken } from '../../auth/tokens.js';
import { assertDisposableDatabase } from '../../auth/__tests__/assert-disposable-db.js';
import { clearSentNotifications, sentNotifications } from '../../notifications/brevo.js';
import { deliverPush } from '../../notifications/service.js';
import { registerDevice, setConsent } from '../consent.js';

const app = createApp();
const users: string[] = [];
let isolated = false;
beforeAll(async () => { await assertDisposableDatabase(); isolated = true; });
afterEach(async () => {
  if (!isolated) return;
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  users.length = 0;
  clearSentNotifications();
});
async function fixture() {
  const user = await prisma.user.create({ data: { phone: `consent-${randomUUID()}`, role: 'CLIENT', status: 'ACTIVE' } });
  users.push(user.id);
  return { userId: user.id, fcmToken: `device-${randomUUID()}`, token: await signAccessToken(user.id, 'CLIENT') };
}
const consentFor = (userId: string) => prisma.consentRecord.findUnique({ where: { userId_purpose: { userId, purpose: 'PUSH_NOTIFICATIONS' } } });

describe('explicit push consent (OVA-156)', () => {
  it('registers a destination without implicitly granting permission or sending push', async () => {
    const f = await fixture();
    const response = await request(app).post('/api/me/devices').set('Authorization', `Bearer ${f.token}`).send({ fcmToken: f.fcmToken, platform: 'IOS' });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ registered: true });
    expect(await consentFor(f.userId)).toBeNull();
    await deliverPush(f.userId, 'permission required');
    expect(sentNotifications()).toEqual([]);
  });

  it('preserves an explicit opt-out and its timestamp across token refresh and re-registration', async () => {
    const f = await fixture();
    await setConsent(f.userId, 'PUSH_NOTIFICATIONS', true);
    await registerDevice(f.userId, f.fcmToken, 'IOS');
    const withdrawn = await request(app).post('/api/me/consents').set('Authorization', `Bearer ${f.token}`).send({ purpose: 'PUSH_NOTIFICATIONS', granted: false });
    expect(withdrawn.status).toBe(200);
    const original = await consentFor(f.userId);
    expect(original?.withdrawnAt).toBeInstanceOf(Date);
    expect(await registerDevice(f.userId, f.fcmToken, 'IOS')).toEqual({ registered: false });
    expect(await registerDevice(f.userId, `${f.fcmToken}-rotated`, 'ANDROID')).toEqual({ registered: false });
    expect(await consentFor(f.userId)).toEqual(original);
    expect(await prisma.deviceToken.count({ where: { userId: f.userId } })).toBe(0);
  });

  it('serializes concurrent first opt-out and registration without losing the opt-out', async () => {
    const f = await fixture();
    await Promise.all([
      registerDevice(f.userId, f.fcmToken, 'IOS'),
      setConsent(f.userId, 'PUSH_NOTIFICATIONS', false),
      registerDevice(f.userId, `${f.fcmToken}-rotated`, 'ANDROID'),
    ]);
    expect((await consentFor(f.userId))?.granted).toBe(false);
    expect(await prisma.deviceToken.count({ where: { userId: f.userId } })).toBe(0);
  });

  it('requires an explicit re-grant before delivery resumes and preserves that grant during registration', async () => {
    const f = await fixture();
    await setConsent(f.userId, 'PUSH_NOTIFICATIONS', false);
    await setConsent(f.userId, 'PUSH_NOTIFICATIONS', true);
    const grant = await consentFor(f.userId);
    await registerDevice(f.userId, f.fcmToken, 'IOS');
    expect(await consentFor(f.userId)).toEqual(grant);
    await deliverPush(f.userId, 'permitted');
    expect(sentNotifications()).toEqual([{ kind: 'push', to: f.fcmToken, summary: 'permitted' }]);
    await setConsent(f.userId, 'PUSH_NOTIFICATIONS', false);
    clearSentNotifications();
    // Even an old token restored independently cannot bypass the consent check.
    await prisma.deviceToken.create({ data: { userId: f.userId, fcmToken: f.fcmToken, platform: 'IOS' } });
    await deliverPush(f.userId, 'must not send');
    expect(sentNotifications()).toEqual([]);
  });

  it('keeps other-purpose grants independent from push permission', async () => {
    const f = await fixture();
    await setConsent(f.userId, 'MARKETING_EMAIL', true);
    await registerDevice(f.userId, f.fcmToken, 'IOS');
    await deliverPush(f.userId, 'not granted');
    expect(sentNotifications()).toEqual([]);
    expect(await consentFor(f.userId)).toBeNull();
  });
});
