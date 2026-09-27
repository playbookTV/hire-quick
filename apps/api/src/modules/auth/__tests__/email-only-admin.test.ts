import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { prisma } from '@hq/database';
import { assertDisposableDatabase } from './assert-disposable-db.js';
import type * as Brevo from '../../notifications/brevo.js';

const delivery = vi.hoisted(() => ({ sendEmail: vi.fn().mockResolvedValue(true) }));
vi.mock('../../notifications/brevo.js', async (original) => ({
  ...(await original<typeof Brevo>()),
  sendEmail: delivery.sendEmail,
}));
import { createApp } from '../../../app.js';

const app = createApp();
const ids: string[] = [];
const subjects: string[] = [];
beforeAll(assertDisposableDatabase);
afterEach(async () => {
  await prisma.verificationCode.deleteMany({ where: { subjectRef: { in: subjects } } });
  await prisma.revokedToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  ids.length = 0;
  subjects.length = 0;
  delivery.sendEmail.mockClear();
});

describe('email-only admin accounts', () => {
  it('persists multiple admins without phones and signs in, refreshes, and authorizes by email', async () => {
    const id = randomUUID();
    const email = `${id}@example.test`;
    ids.push(id, randomUUID());
    await prisma.user.create({ data: { id, email, role: 'ADMIN', status: 'ACTIVE' } });
    await prisma.user.create({
      data: { id: ids[1]!, email: `${ids[1]}@example.test`, role: 'ADMIN', status: 'ACTIVE' },
    });
    subjects.push(`admin-email:${email}:${id}`);
    const sent = await request(app).post('/auth/admin/otp/request').send({ email });
    expect(sent.status).toBe(200);
    expect(sent.body).toEqual({ sent: true });
    expect(delivery.sendEmail).toHaveBeenCalledOnce();
    const html = String(delivery.sendEmail.mock.calls[0]![2]);
    const code = /<strong>(\d{6})<\/strong>/.exec(html)![1];
    const login = await request(app).post('/auth/admin/otp/verify').send({ email, code });
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({ id, role: 'ADMIN', phone: null });
    const me = await request(app).get('/api/me').auth(login.body.accessToken, { type: 'bearer' });
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ email, phone: null, role: 'ADMIN' });
    const users = await request(app).get('/api/admin/users').auth(login.body.accessToken, { type: 'bearer' });
    expect(users.status).toBe(200);
    const refreshed = await request(app).post('/auth/refresh').send({ refreshToken: login.body.refreshToken });
    expect(refreshed.status).toBe(200);
    expect((await request(app).post('/auth/admin/otp/verify').send({ email, code })).status).toBe(400);
    expect(await prisma.user.findUnique({ where: { id } })).toMatchObject({ phone: null });
  });

  it.each(['CLIENT', 'USHER'] as const)('requires a phone for %s even through direct database writes', async (role) => {
    const id = randomUUID();
    ids.push(id);
    await expect(prisma.$executeRaw`
      INSERT INTO users (id, role, email, status, "updatedAt")
      VALUES (${id}::uuid, ${role}::"UserRole", ${`${id}@example.test`}, 'ACTIVE', now())
    `).rejects.toMatchObject({ code: 'P2010', meta: { code: '23514' } });
  });

  it.each([null, '', '   '])('requires a nonblank email for an admin without a phone (%j)', async (email) => {
    const id = randomUUID();
    ids.push(id);
    await expect(prisma.$executeRaw`
      INSERT INTO users (id, role, email, status, "updatedAt")
      VALUES (${id}::uuid, 'ADMIN', ${email}, 'ACTIVE', now())
    `).rejects.toMatchObject({ code: 'P2010', meta: { code: '23514' } });
  });

  it('keeps phone sign-in validation mandatory and refuses public admin registration', async () => {
    for (const phone of [undefined, null, '']) {
      expect((await request(app).post('/auth/otp/request').send({ phone })).status).toBe(400);
      expect((await request(app).post('/auth/otp/verify').send({ phone, code: '123456' })).status).toBe(400);
    }
    expect((await request(app).post('/auth/otp/verify').send({
      phone: '+2348000000000', code: '123456', role: 'ADMIN',
    })).status).toBe(400);
    const email = `${randomUUID()}@example.test`;
    expect((await request(app).post('/auth/admin/otp/request').send({ email })).status).toBe(200);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
    expect(delivery.sendEmail).not.toHaveBeenCalled();
  });
});
