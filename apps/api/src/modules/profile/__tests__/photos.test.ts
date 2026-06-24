/**
 * HTTP coverage for the usher profile-photo + portfolio endpoints. DB-backed;
 * mirrors ushers/__tests__/wiring.test.ts. The test app is created without
 * storage, so presignDoc passes keys through and the upload-url route 503s —
 * we exercise the submit/read/delete paths directly with raw keys.
 */
import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@hq/database';
import { createApp } from '../../../app.js';
import { InMemoryPaystack } from '../../payments/port/paystack-port.js';
import { signAccessToken } from '../../auth/tokens.js';
import { photoKey, ownsPhotoKey } from '../../storage/storage.js';

const app = createApp({ paystack: new InMemoryPaystack(), paystackSecret: 'x' });

const userIds: string[] = [];
const usherIds: string[] = [];

function tag(): string {
  return randomUUID().slice(0, 8);
}

async function makeUsher(): Promise<{ userId: string; usherId: string; token: string; auth: { Authorization: string } }> {
  const u = await prisma.user.create({
    data: {
      role: 'USHER',
      phone: `+23470${tag()}`,
      status: 'ACTIVE',
      usher: { create: { displayName: `Usher ${tag()}`, verificationStatus: 'VERIFIED' } },
    },
    include: { usher: true },
  });
  userIds.push(u.id);
  usherIds.push(u.usher!.id);
  const token = await signAccessToken(u.id, 'USHER');
  return { userId: u.id, usherId: u.usher!.id, token, auth: { Authorization: `Bearer ${token}` } };
}

afterEach(async () => {
  await prisma.photo.deleteMany({ where: { usherId: { in: usherIds } } });
  await prisma.usher.deleteMany({ where: { id: { in: usherIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  userIds.length = 0;
  usherIds.length = 0;
});

describe('portfolio photos', () => {
  it('adds photos and returns them on GET /api/me, capping at five', async () => {
    const { usherId, auth } = await makeUsher();

    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/api/me/photos/portfolio')
        .set(auth)
        .send({ key: `photos/${usherId}/portfolio-${i}.jpg` });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ imageUrl: `photos/${usherId}/portfolio-${i}.jpg` });
    }

    // sixth is rejected
    const sixth = await request(app)
      .post('/api/me/photos/portfolio')
      .set(auth)
      .send({ key: `photos/${usherId}/portfolio-5.jpg` });
    expect(sixth.status).toBe(409);
    expect(sixth.body.error.code).toBe('PHOTO_LIMIT');

    const me = await request(app).get('/api/me').set(auth);
    expect(me.status).toBe(200);
    expect(me.body.usher.portfolio).toHaveLength(5);
  });

  it('deletes a portfolio photo the caller owns', async () => {
    const { usherId, auth } = await makeUsher();
    const created = await request(app)
      .post('/api/me/photos/portfolio')
      .set(auth)
      .send({ key: `photos/${usherId}/portfolio-x.jpg` });
    const id = created.body.id as string;

    const del = await request(app).delete(`/api/me/photos/portfolio/${id}`).set(auth);
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ deleted: true });

    const me = await request(app).get('/api/me').set(auth);
    expect(me.body.usher.portfolio).toHaveLength(0);
  });

  it("cannot delete another usher's photo", async () => {
    const a = await makeUsher();
    const b = await makeUsher();
    const created = await request(app)
      .post('/api/me/photos/portfolio')
      .set(a.auth)
      .send({ key: `photos/${a.usherId}/portfolio-x.jpg` });
    const id = created.body.id as string;

    const del = await request(app).delete(`/api/me/photos/portfolio/${id}`).set(b.auth);
    expect(del.status).toBe(404);
    // still there for the owner
    const me = await request(app).get('/api/me').set(a.auth);
    expect(me.body.usher.portfolio).toHaveLength(1);
  });
});

describe('profile photo (avatar)', () => {
  it('sets the avatar and surfaces it on /api/me and /api/ushers/:id', async () => {
    const { usherId, auth } = await makeUsher();
    const key = `photos/${usherId}/avatar.jpg`;

    const put = await request(app).put('/api/me/photos/avatar').set(auth).send({ key });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ avatarUrl: key });

    const me = await request(app).get('/api/me').set(auth);
    expect(me.body.usher.avatarUrl).toBe(key);

    const pub = await request(app).get(`/api/ushers/${usherId}`).set(auth);
    expect(pub.body.avatarUrl).toBe(key);
    expect(pub.body.portfolio).toEqual([]);
  });
});

describe('photo key helpers', () => {
  it('scopes keys to the usher prefix', () => {
    const key = photoKey('usher-1', 'avatar', 'jpg');
    expect(key.startsWith('photos/usher-1/avatar-')).toBe(true);
    expect(ownsPhotoKey('usher-1', key)).toBe(true);
    expect(ownsPhotoKey('usher-2', key)).toBe(false);
  });
});
