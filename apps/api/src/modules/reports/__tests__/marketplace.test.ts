import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@hq/database';
import { createApp } from '../../../app.js';
import { signAccessToken } from '../../auth/tokens.js';
import { assertDisposableDatabase } from '../../auth/__tests__/assert-disposable-db.js';
import {
  applyToEvent,
  inviteManyToEvent,
  replyToInvitation,
  withdrawApplication,
} from '../../events/recruitment.js';
import { buildExport, eraseUser } from '../../privacy/service.js';
import { photoKey, type StoragePort } from '../../storage/storage.js';
import {
  issueUpload,
  finalizeUpload,
  scheduleDeletion,
  cleanupStorage,
} from '../../storage/uploads.js';
import { confirmBatch } from '../../bookings/service.js';
import { InMemoryPaystack } from '../../payments/port/paystack-port.js';

const app = createApp({});
const users: string[] = [],
  events: string[] = [],
  policyNames: string[] = [];
let isolated = false;
beforeAll(async () => {
  await assertDisposableDatabase();
  isolated = true;
});
afterEach(async () => {
  if (!isolated) return;
  await prisma.marketplaceReport.deleteMany({ where: { reporterId: { in: users } } });
  await prisma.booking.deleteMany({ where: { eventId: { in: events } } });
  await prisma.order.deleteMany({ where: { eventId: { in: events } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.uploadIntent.deleteMany({ where: { ownerId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.presentationPolicy.deleteMany({ where: { category: { in: policyNames } } });
  users.length = events.length = policyNames.length = 0;
});
async function person(role: 'CLIENT' | 'USHER' | 'ADMIN') {
  const user = await prisma.user.create({
    data: {
      phone: `market-${randomUUID()}`,
      role,
      status: 'ACTIVE',
      ...(role === 'CLIENT'
        ? {
            client: {
              create: {
                displayName: 'Event Company',
                accountType: 'INDIVIDUAL',
                verificationStatus: 'VERIFIED',
              },
            },
          }
        : {}),
      ...(role === 'USHER'
        ? {
            usher: {
              create: {
                displayName: 'Staff Member',
                state: 'Lagos',
                verificationStatus: 'VERIFIED',
                wallet: { create: {} },
              },
            },
          }
        : {}),
    },
    include: { client: true, usher: true },
  });
  users.push(user.id);
  return { ...user, auth: `Bearer ${await signAccessToken(user.id, role)}` };
}
async function fixture() {
  const client = await person('CLIENT'),
    worker = await person('USHER');
  const event = await prisma.event.create({
    data: {
      clientId: client.client!.id,
      title: `Gala ${randomUUID()}`,
      venue: `SecretVenue${randomUUID()}`,
      state: 'Lagos',
      category: 'Wedding',
      eventDate: new Date('2030-06-01'),
      startTime: '10:00',
      endTime: '18:00',
      headcount: 4,
      budgetPerHead: 10000,
      status: 'OPEN',
    },
  });
  events.push(event.id);
  return { client, worker, event };
}
const report = (targetType: 'JOB' | 'WORKER', targetId: string) => ({
  targetType,
  targetId,
  reason: 'Misleading information',
  details: 'The advertised details are inaccurate.',
});

describe('pre-booking marketplace reports', () => {
  it('accepts either target without a booking, deduplicates concurrent retries, and restricts roles', async () => {
    const f = await fixture();
    const send = () =>
      request(app)
        .post('/api/reports')
        .set('Authorization', f.worker.auth)
        .send(report('JOB', f.event.id));
    const responses = await Promise.all([send(), send()]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(responses[0]!.body.id).toBe(responses[1]!.body.id);
    expect(Object.keys(responses[0]!.body).sort()).toEqual(['id', 'status']);
    expect(
      (
        await request(app)
          .post('/api/reports')
          .set('Authorization', f.client.auth)
          .send(report('WORKER', f.worker.usher!.id))
      ).status,
    ).toBe(201);
    expect(
      (
        await request(app)
          .post('/api/reports')
          .set('Authorization', f.client.auth)
          .send(report('JOB', f.event.id))
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/reports')
          .set('Authorization', f.worker.auth)
          .send(report('WORKER', f.worker.usher!.id))
      ).status,
    ).toBe(403);
    expect((await request(app).post('/api/reports').send(report('JOB', f.event.id))).status).toBe(
      401,
    );
    await expect(prisma.event.delete({ where: { id: f.event.id } })).rejects.toThrow(
      /marketplace_reports_eventId_fkey/,
    );
    await expect(prisma.usher.delete({ where: { id: f.worker.usher!.id } })).rejects.toThrow(
      /marketplace_reports_usherId_fkey/,
    );
    expect(
      (await request(app).get('/api/admin/reports').set('Authorization', f.worker.auth)).status,
    ).toBe(403);
  });
  it('does not expose draft jobs or unverified workers and validates report detail', async () => {
    const f = await fixture();
    await prisma.event.update({ where: { id: f.event.id }, data: { status: 'DRAFT' } });
    expect(
      (
        await request(app)
          .post('/api/reports')
          .set('Authorization', f.worker.auth)
          .send(report('JOB', f.event.id))
      ).status,
    ).toBe(404);
    await prisma.usher.update({
      where: { id: f.worker.usher!.id },
      data: { verificationStatus: 'PENDING' },
    });
    expect(
      (
        await request(app)
          .post('/api/reports')
          .set('Authorization', f.client.auth)
          .send(report('WORKER', f.worker.usher!.id))
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post('/api/reports')
          .set('Authorization', f.worker.auth)
          .send({ ...report('JOB', f.event.id), details: 'short' })
      ).status,
    ).toBe(400);
  });
  it('supports admin review, rejects stale decisions and keeps notes private', async () => {
    const f = await fixture(),
      admin = await person('ADMIN');
    const created = await request(app)
      .post('/api/reports')
      .set('Authorization', f.worker.auth)
      .send(report('JOB', f.event.id));
    const list = await request(app)
      .get('/api/admin/reports?status=OPEN')
      .set('Authorization', admin.auth);
    expect(list.status).toBe(200);
    expect(list.headers['cache-control']).toBe('no-store');
    expect(list.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.body.id,
          details: 'The advertised details are inaccurate.',
        }),
      ]),
    );
    const review = (expectedStatus: string, status: string) =>
      request(app)
        .patch(`/api/admin/reports/${created.body.id}`)
        .set('Authorization', admin.auth)
        .send({ expectedStatus, status, note: 'Reviewed supporting information.' });
    expect((await review('OPEN', 'UNDER_REVIEW')).status).toBe(200);
    expect((await review('OPEN', 'RESOLVED')).status).toBe(409);
    expect((await review('UNDER_REVIEW', 'UNDER_REVIEW')).status).toBe(409);
    expect((await review('UNDER_REVIEW', 'RESOLVED')).status).toBe(200);
    expect((await review('RESOLVED', 'DISMISSED')).status).toBe(409);
    const replay = await request(app)
      .post('/api/reports')
      .set('Authorization', f.worker.auth)
      .send(report('JOB', f.event.id));
    expect(replay.body).toEqual({ id: created.body.id, status: 'RESOLVED' });
  });
});

describe('profiles, preferences and job discovery', () => {
  it('round-trips optional worker attributes, allows removal and rejects invalid sizes', async () => {
    const f = await fixture();
    const attributes = {
      heightCm: 178,
      shoeSizeUk: 7.5,
      gender: 'Female',
      dressSize: 'M',
      hairstyle: 'Braids',
    };
    expect(
      (
        await request(app)
          .patch('/api/me')
          .set('Authorization', f.worker.auth)
          .send({ physicalAttributes: attributes })
      ).status,
    ).toBe(200);
    const read = await request(app)
      .get(`/api/ushers/${f.worker.usher!.id}`)
      .set('Authorization', f.client.auth);
    expect(read.body.physicalAttributes).toEqual(attributes);
    expect(
      (
        await request(app)
          .patch('/api/me')
          .set('Authorization', f.worker.auth)
          .send({ physicalAttributes: { heightCm: 999 } })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .patch('/api/me')
          .set('Authorization', f.worker.auth)
          .send({ physicalAttributes: null })
      ).status,
    ).toBe(200);
    expect(
      (await prisma.usher.findUniqueOrThrow({ where: { id: f.worker.usher!.id } }))
        .physicalAttributes,
    ).toBeNull();
  });
  it('publishes rich company details and statistics without contact details or storage keys', async () => {
    const f = await fixture();
    const body = {
      description: 'Lagos events and hospitality.',
      position: 'Producer',
      city: 'Lekki',
      contactEmail: 'private@example.com',
    };
    expect(
      (await request(app).patch('/api/me').set('Authorization', f.client.auth).send(body)).status,
    ).toBe(200);
    const read = await request(app)
      .get(`/api/clients/${f.client.client!.id}`)
      .set('Authorization', f.worker.auth);
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({
      description: body.description,
      position: 'Producer',
      city: 'Lekki',
      jobsPosted: 1,
      activeJobs: 1,
    });
    for (const key of ['contactEmail', 'phone', 'userId', 'avatarKey'])
      expect(read.body).not.toHaveProperty(key);
    const own = await request(app).get('/api/me').set('Authorization', f.client.auth);
    expect(own.body.client.contactEmail).toBe(body.contactEmail);
    await prisma.user.update({ where: { id: f.client.id }, data: { status: 'SUSPENDED' } });
    expect(
      (
        await request(app)
          .get(`/api/clients/${f.client.client!.id}`)
          .set('Authorization', f.worker.auth)
      ).status,
    ).toBe(404);
  });
  it('attaches only the client’s own verified avatar and protects referenced objects from cleanup', async () => {
    const f = await fixture(),
      other = await person('CLIENT');
    const deleted: string[] = [];
    const storage: StoragePort = {
      presignUpload: async (key) => `https://storage.invalid/put/${key}`,
      presignDownload: async (key) => `https://storage.invalid/get/${key}`,
      inspectObject: async () => ({
        size: 4,
        contentType: 'image/jpeg',
        etag: 'v1',
        prefix: Buffer.from([255, 216, 255, 0]),
      }),
      copyObject: async () => {},
      deleteObject: async (key) => {
        deleted.push(key);
      },
    };
    const photoApp = createApp({ storage });
    const key = photoKey(f.client.client!.id, 'avatar', 'jpg');
    await issueUpload(storage, {
      key,
      ownerId: f.client.id,
      scopeId: f.client.client!.id,
      purpose: 'avatar',
      contentType: 'image/jpeg',
      byteSize: 4,
    });
    const attach = (auth: string) =>
      request(photoApp).put('/api/me/photos/avatar').set('Authorization', auth).send({ key });
    expect((await attach(f.client.auth)).status).toBe(400);
    await finalizeUpload(storage, f.client.id, key);
    expect((await attach(other.auth)).status).toBe(400);
    expect((await attach(f.client.auth)).status).toBe(200);
    const profile = await request(photoApp)
      .get(`/api/clients/${f.client.client!.id}`)
      .set('Authorization', f.worker.auth);
    expect(profile.body.avatarUrl).toBe(`https://storage.invalid/get/${key}`);
    await prisma.$transaction((tx) => scheduleDeletion(tx, key));
    await cleanupStorage(storage, [key]);
    expect(deleted).not.toContain(key);
    await prisma.$transaction((tx) => eraseUser(tx, f.client.id));
    await prisma.storageDeletion.update({ where: { key }, data: { nextAttemptAt: new Date(0) } });
    await cleanupStorage(storage, [key]);
    expect(deleted).toContain(key);
    await prisma.storageDeletion.deleteMany({ where: { key: { in: [key, `staging/${key}`] } } });
  });
  it('searches titles and client names, preserving state and venue privacy', async () => {
    const f = await fixture();
    const search = (query: string) =>
      request(app).get('/api/events').query({ query }).set('Authorization', f.worker.auth);
    const found = await search(f.event.title.toLowerCase());
    expect(found.status).toBe(200);
    expect(found.body.map((e: { id: string }) => e.id)).toContain(f.event.id);
    expect(found.body[0].venue).not.toBe(f.event.venue);
    expect((await search(f.event.venue)).body).toHaveLength(0);
    expect((await search('Event Company')).body.map((e: { id: string }) => e.id)).toContain(
      f.event.id,
    );
    await applyToEvent(prisma, f.event.id, f.worker.usher!.id);
    expect(
      (
        await request(app)
          .post(`/api/events/${f.event.id}/save`)
          .set('Authorization', f.worker.auth)
      ).status,
    ).toBe(201);
    for (const path of ['/api/me/applications', '/api/me/saved-jobs']) {
      const response = await request(app).get(path).set('Authorization', f.worker.auth);
      expect(response.status).toBe(200);
      const savedEvent = path.endsWith('applications') ? response.body[0].event : response.body[0];
      expect(savedEvent.client.displayName).toBe('Event Company');
      expect(savedEvent.venue).not.toBe(f.event.venue);
      expect(savedEvent.client).not.toHaveProperty('contactEmail');
    }
    await prisma.event.update({ where: { id: f.event.id }, data: { state: 'Abuja' } });
    expect((await search(f.event.title)).body).toHaveLength(0);
  });
  it('requires a rationale and enforces category controls on creation and editing', async () => {
    const f = await fixture(),
      admin = await person('ADMIN');
    const category = `Test-${randomUUID()}`;
    policyNames.push(category.toLowerCase());
    const eventBody = {
      title: 'Presentation test',
      venue: 'Test venue',
      category,
      eventDate: '2030-06-01',
      startTime: '10:00',
      endTime: '18:00',
      headcount: 2,
      budgetPerHeadKobo: 10000,
      state: 'Lagos',
    };
    const presentation = {
      attributes: { dressSize: 'M' },
      rationale: 'Uniforms are provided in this size.',
    };
    expect(
      (
        await request(app)
          .post('/api/events')
          .set('Authorization', f.client.auth)
          .send({ ...eventBody, presentation: { attributes: { dressSize: 'M' } } })
      ).status,
    ).toBe(400);
    const created = await request(app)
      .post('/api/events')
      .set('Authorization', f.client.auth)
      .send({ ...eventBody, presentation });
    expect(created.status).toBe(201);
    events.push(created.body.id);
    expect(created.body.preferences.presentation).toEqual(presentation);
    expect(
      (
        await request(app)
          .put('/api/admin/presentation-policies')
          .set('Authorization', f.client.auth)
          .send({ category, enabled: false })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .put('/api/admin/presentation-policies')
          .set('Authorization', admin.auth)
          .send({ category, enabled: false })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post('/api/events')
          .set('Authorization', f.client.auth)
          .send({ ...eventBody, presentation })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .patch(`/api/events/${created.body.id}`)
          .set('Authorization', f.client.auth)
          .send({ presentation })
      ).status,
    ).toBe(400);
    const removed = await request(app)
      .patch(`/api/events/${created.body.id}`)
      .set('Authorization', f.client.auth)
      .send({ presentation: null });
    expect(removed.status).toBe(200);
    expect(removed.body.preferences?.presentation).toBeUndefined();
  });
  it('exports and erases the new personal details and authored reports', async () => {
    const f = await fixture();
    await prisma.usher.update({
      where: { id: f.worker.usher!.id },
      data: { physicalAttributes: { heightCm: 175 } },
    });
    const invitation = await prisma.invitation.create({
      data: {
        eventId: f.event.id,
        usherId: f.worker.usher!.id,
        status: 'DECLINED',
        declineReason: 'Other',
        declineNote: 'Personal detail',
      },
    });
    await request(app)
      .post('/api/reports')
      .set('Authorization', f.worker.auth)
      .send(report('JOB', f.event.id));
    const exported = await buildExport(f.worker.id);
    expect(exported.reports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ details: 'The advertised details are inaccurate.' }),
      ]),
    );
    expect(exported.invitationReplies).toEqual(
      expect.arrayContaining([expect.objectContaining({ declineNote: 'Personal detail' })]),
    );
    await prisma.$transaction((tx) => eraseUser(tx, f.worker.id));
    expect(
      (await prisma.usher.findUniqueOrThrow({ where: { id: f.worker.usher!.id } }))
        .physicalAttributes,
    ).toBeNull();
    expect(
      (await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } })).declineNote,
    ).toBeNull();
    expect(
      (await prisma.marketplaceReport.findFirstOrThrow({ where: { reporterId: f.worker.id } }))
        .details,
    ).toBe('[redacted]');
    await prisma.client.update({
      where: { id: f.client.client!.id },
      data: {
        description: 'Private bio',
        position: 'Host',
        city: 'Lagos',
        contactEmail: 'private@example.com',
      },
    });
    await prisma.$transaction((tx) => eraseUser(tx, f.client.id));
    expect(
      await prisma.client.findUniqueOrThrow({ where: { id: f.client.client!.id } }),
    ).toMatchObject({
      description: null,
      position: null,
      city: null,
      contactEmail: null,
      avatarKey: null,
    });
  });
});

describe('withdrawal, invitations and decline reasons', () => {
  it('stores decline reasons for the client and makes response retries idempotent', async () => {
    const f = await fixture();
    const { invitations } = await inviteManyToEvent(prisma, f.event.id, f.client.client!.id, [
      f.worker.usher!.id,
    ]);
    const id = invitations[0]!.invitation.id;
    const decline = (note: string) =>
      request(app)
        .patch(`/api/invitations/${id}`)
        .set('Authorization', f.worker.auth)
        .send({ status: 'DECLINED', reason: 'Other', note });
    expect((await decline('First reason')).status).toBe(200);
    expect((await decline('Retry must not replace')).status).toBe(200);
    const list = await request(app)
      .get(`/api/events/${f.event.id}/invitations`)
      .set('Authorization', f.client.auth);
    expect(list.body[0]).toMatchObject({ declineReason: 'Other', declineNote: 'First reason' });
    expect(
      (
        await request(app)
          .patch(`/api/invitations/${id}`)
          .set('Authorization', f.worker.auth)
          .send({ status: 'DECLINED', reason: 'invalid' })
      ).status,
    ).toBe(400);
  });
  it('withdraws only the owner’s application, supports retries and allows ordinary reapplication', async () => {
    const f = await fixture(),
      other = await person('USHER');
    const { application } = await applyToEvent(prisma, f.event.id, f.worker.usher!.id);
    expect(
      (
        await request(app)
          .post(`/api/applications/${application.id}/withdraw`)
          .set('Authorization', other.auth)
      ).status,
    ).toBe(404);
    const withdraw = () =>
      request(app)
        .post(`/api/applications/${application.id}/withdraw`)
        .set('Authorization', f.worker.auth);
    expect((await withdraw()).body.status).toBe('WITHDRAWN');
    expect((await withdraw()).body.status).toBe('WITHDRAWN');
    expect((await applyToEvent(prisma, f.event.id, f.worker.usher!.id)).application.status).toBe(
      'APPLIED',
    );
  });
  it('does not withdraw a reserved or confirmed booking', async () => {
    const f = await fixture();
    const { application } = await applyToEvent(prisma, f.event.id, f.worker.usher!.id);
    const booking = await prisma.booking.create({
      data: {
        eventId: f.event.id,
        usherId: f.worker.usher!.id,
        amount: 11500,
        staffPay: 10000,
        status: 'PENDING_PAYMENT',
      },
    });
    for (const status of ['PENDING_PAYMENT', 'CONFIRMED'] as const) {
      await prisma.booking.update({ where: { id: booking.id }, data: { status } });
      await expect(withdrawApplication(prisma, application.id, f.worker.id)).rejects.toMatchObject({
        code: 'ALREADY_CONFIRMED',
      });
    }
    expect(
      (await prisma.application.findUniqueOrThrow({ where: { id: application.id } })).status,
    ).toBe('APPLIED');
  });
  it('serializes checkout versus withdrawal so a withdrawn application cannot be reserved', async () => {
    const f = await fixture();
    const application = await prisma.application.create({
      data: { eventId: f.event.id, usherId: f.worker.usher!.id, status: 'ACCEPTED' },
    });
    const paystack = new InMemoryPaystack();
    const results = await Promise.allSettled([
      withdrawApplication(prisma, application.id, f.worker.id),
      confirmBatch(
        { prisma, paystack },
        {
          eventId: f.event.id,
          clientUserId: f.client.id,
          applicationIds: [application.id],
          email: 'test@example.com',
          idempotencyKey: randomUUID(),
        },
      ),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const current = await prisma.application.findUniqueOrThrow({ where: { id: application.id } });
    const booking = await prisma.booking.findFirst({ where: { eventId: f.event.id } });
    expect(
      current.status === 'WITHDRAWN' ? booking === null : booking?.status === 'PENDING_PAYMENT',
    ).toBe(true);
  });
  it('invites atomically, rejects duplicates, validates ownership, and preserves existing replies', async () => {
    const f = await fixture(),
      second = await person('USHER'),
      outsider = await person('CLIENT');
    await prisma.usher.update({
      where: { id: second.usher!.id },
      data: { verificationStatus: 'PENDING' },
    });
    await expect(
      inviteManyToEvent(prisma, f.event.id, f.client.client!.id, [
        f.worker.usher!.id,
        second.usher!.id,
      ]),
    ).rejects.toMatchObject({ code: 'SELECTION_CHANGED' });
    expect(await prisma.invitation.count({ where: { eventId: f.event.id } })).toBe(0);
    expect(
      (
        await request(app)
          .post(`/api/events/${f.event.id}/invite-batch`)
          .set('Authorization', f.client.auth)
          .send({ usherIds: [f.worker.usher!.id, f.worker.usher!.id] })
      ).status,
    ).toBe(400);
    await expect(
      inviteManyToEvent(prisma, f.event.id, outsider.client!.id, [f.worker.usher!.id]),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await prisma.usher.update({
      where: { id: second.usher!.id },
      data: { verificationStatus: 'VERIFIED' },
    });
    const ids = [f.worker.usher!.id, second.usher!.id];
    const first = await inviteManyToEvent(prisma, f.event.id, f.client.client!.id, ids);
    const retry = await inviteManyToEvent(prisma, f.event.id, f.client.client!.id, ids);
    expect(first.invitations.map((i) => i.invitation.id)).toEqual(
      retry.invitations.map((i) => i.invitation.id),
    );
    expect(retry.invitations.every((i) => !i.notify)).toBe(true);
    const invitation = first.invitations.find(
      (i) => i.invitation.usherId === f.worker.usher!.id,
    )!.invitation;
    await replyToInvitation(prisma, invitation.id, f.worker.usher!.id, 'DECLINED'); // old client compatibility
    await expect(
      inviteManyToEvent(prisma, f.event.id, f.client.client!.id, ids),
    ).rejects.toMatchObject({ code: 'INVITATION_CLOSED' });
  });
});
