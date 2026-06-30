import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@hq/database';
import { createApp } from '../../../app.js';
import { InMemoryPaystack } from '../../payments/port/paystack-port.js';

const app = createApp({ paystack: new InMemoryPaystack(), paystackSecret: 'x' });

const phones: string[] = [];
const userIds: string[] = [];
function newPhone(): string {
  const p = `+234${randomUUID().replace(/\D/g, '').slice(0, 9).padEnd(9, '0')}`;
  phones.push(p);
  return p;
}

afterEach(async () => {
  await prisma.verificationCode.deleteMany({ where: { subjectRef: { in: phones } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  phones.length = 0;
  userIds.length = 0;
});

async function login(phone: string, role?: 'CLIENT' | 'USHER'): Promise<{ token: string; refresh: string; userId: string }> {
  const req1 = await request(app).post('/auth/otp/request').send({ phone });
  expect(req1.status).toBe(200);
  const code = req1.body.devCode as string;
  const req2 = await request(app).post('/auth/otp/verify').send({ phone, code, role });
  expect(req2.status).toBe(200);
  userIds.push(req2.body.user.id);
  return { token: req2.body.accessToken, refresh: req2.body.refreshToken, userId: req2.body.user.id };
}

describe('auth + RBAC (TRD §7/§14/§15)', () => {
  it('OTP login issues tokens, creates the usher+wallet, and protects /me', async () => {
    const phone = newPhone();
    const { token } = await login(phone, 'USHER');

    const me = await request(app).get('/api/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.role).toBe('USHER');
    expect(me.body.usher?.wallet).toBeTruthy();

    const noAuth = await request(app).get('/api/me');
    expect(noAuth.status).toBe(401);
  });

  it('rejects a wrong OTP and a bad token', async () => {
    const phone = newPhone();
    await request(app).post('/auth/otp/request').send({ phone });
    const bad = await request(app).post('/auth/otp/verify').send({ phone, code: '000000' });
    expect(bad.status).toBe(400);

    const badTok = await request(app).get('/api/me').set('Authorization', 'Bearer not.a.jwt');
    expect(badTok.status).toBe(401);
  });

  it('refresh rotates tokens', async () => {
    const phone = newPhone();
    const { refresh } = await login(phone, 'CLIENT');
    const res = await request(app).post('/auth/refresh').send({ refreshToken: refresh });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
  });

  it('logout denylists the refresh token so it can no longer refresh (B3)', async () => {
    const phone = newPhone();
    const { refresh } = await login(phone, 'USHER');

    expect((await request(app).post('/auth/logout').send({ refreshToken: refresh })).status).toBe(204);

    const after = await request(app).post('/auth/refresh').send({ refreshToken: refresh });
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe('INVALID_REFRESH');
  });

  it('refresh rotation is single-use: the consumed token is burned (B3)', async () => {
    const phone = newPhone();
    const { refresh } = await login(phone, 'CLIENT');

    expect((await request(app).post('/auth/refresh').send({ refreshToken: refresh })).status).toBe(200);
    // Replaying the now-rotated token must fail — it was denylisted on rotation.
    const replay = await request(app).post('/auth/refresh').send({ refreshToken: refresh });
    expect(replay.status).toBe(401);
  });

  it('admin can approve a verification; a non-admin is forbidden (§15)', async () => {
    // usher submits a verification
    const usherPhone = newPhone();
    const { token: usherToken } = await login(usherPhone, 'USHER');
    const sub = await request(app)
      .post('/api/me/verification')
      .set('Authorization', `Bearer ${usherToken}`)
      .send({ idDocumentUrl: 'https://example.com/id.png', selfieUrl: 'https://example.com/selfie.png' });
    expect(sub.status).toBe(201);
    const verificationId = sub.body.id as string;

    // a non-admin (the usher) cannot approve
    const forbidden = await request(app)
      .post(`/api/admin/verifications/${verificationId}/approve`)
      .set('Authorization', `Bearer ${usherToken}`);
    expect(forbidden.status).toBe(403);

    // promote a fresh user to ADMIN, then approve
    const adminPhone = newPhone();
    const { token: adminToken, userId: adminId } = await login(adminPhone, 'CLIENT');
    await prisma.user.update({ where: { id: adminId }, data: { role: 'ADMIN' } });
    // re-login to get a token carrying the ADMIN role
    const reReq = await request(app).post('/auth/otp/request').send({ phone: adminPhone });
    const reVer = await request(app)
      .post('/auth/otp/verify')
      .send({ phone: adminPhone, code: reReq.body.devCode });
    const freshAdminToken = reVer.body.accessToken as string;

    const approve = await request(app)
      .post(`/api/admin/verifications/${verificationId}/approve`)
      .set('Authorization', `Bearer ${freshAdminToken}`);
    expect(approve.status).toBe(200);
    expect(approve.body.status).toBe('APPROVED');

    const usher = await prisma.usherVerification.findUniqueOrThrow({ where: { id: verificationId } });
    expect(usher.status).toBe('APPROVED');
    const audit = await prisma.auditLog.findFirst({ where: { actorId: adminId, action: 'verification.approve' } });
    expect(audit).toBeTruthy();

    void adminToken;
  });
});
