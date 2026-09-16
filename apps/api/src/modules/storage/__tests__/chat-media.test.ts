/** Storage is mocked; the DB is allowed only in disposable validation schemas. */
import type * as Notifications from '../../notifications/service.js';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { io as ioClient } from 'socket.io-client';
import { prisma } from '@hq/database';
import { createApp } from '../../../app.js';
import { socketToken } from '../../../realtime/__tests__/session-fixture.js';
import { assertDisposableDatabase } from '../../auth/__tests__/assert-disposable-db.js';
import { chatMediaKey } from '../chat-media.js';
import { jobRetentionPurge } from '../../jobs/jobs.js';
import { sendMessage } from '../../../realtime/messages.js';
import { attachRealtime } from '../../../realtime/gateway.js';

vi.mock('../../notifications/service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof Notifications>()),
  notifyNewMessage: vi.fn(),
}));
const storage = {
  presignUpload: vi.fn(async (key: string, _mime: string) => `https://storage.invalid/put/${key}`),
  presignDownload: vi.fn(async (key: string) => `https://storage.invalid/get/${key}`),
  deleteObject: vi.fn(async (_key: string) => undefined),
};
const app = createApp({ storage });
const userIds: string[] = [];
const bookingIds: string[] = [];
const eventIds: string[] = [];
let validated = false;
beforeAll(async () => {
  await assertDisposableDatabase();
  validated = true;
});
afterEach(async () => {
  if (!validated) return;
  await prisma.conversation.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
  await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  userIds.length = 0;
  bookingIds.length = 0;
  eventIds.length = 0;
  vi.clearAllMocks();
});
async function fixture(old = false) {
  const client = await prisma.user.create({
    data: {
      phone: `media-client-${randomUUID()}`,
      role: 'CLIENT',
      status: 'ACTIVE',
      client: { create: { displayName: 'Chat media test' } },
    },
    include: { client: true },
  });
  const usher = await prisma.user.create({
    data: {
      phone: `media-usher-${randomUUID()}`,
      role: 'USHER',
      status: 'ACTIVE',
      usher: { create: {} },
    },
    include: { usher: true },
  });
  userIds.push(client.id, usher.id);
  const event = await prisma.event.create({
    data: {
      clientId: client.client!.id,
      title: 'Chat media test',
      venue: 'Lagos',
      category: 'Gala',
      headcount: 1,
      budgetPerHead: 10000,
      eventDate: old ? new Date('2020-01-01') : new Date(),
      startTime: '10:00',
      endTime: '16:00',
    },
  });
  eventIds.push(event.id);
  const booking = await prisma.booking.create({
    data: { eventId: event.id, usherId: usher.usher!.id, amount: 10000, status: 'CONFIRMED' },
  });
  bookingIds.push(booking.id);
  const conversation = await prisma.conversation.create({
    data: { bookingId: booking.id, clientId: client.client!.id, usherId: usher.usher!.id },
  });
  return {
    bookingId: booking.id,
    clientId: client.id,
    usherId: usher.id,
    conversationId: conversation.id,
    token: await socketToken(client.id, 'CLIENT'),
    usherToken: await socketToken(usher.id, 'USHER'),
  };
}
async function issue(f: Awaited<ReturnType<typeof fixture>>, type: 'IMAGE' | 'VOICE' = 'IMAGE') {
  const response = await request(app)
    .post(`/api/bookings/${f.bookingId}/media/upload-url`)
    .set('Authorization', `Bearer ${f.token}`)
    .send({ contentType: type, mimeType: type === 'IMAGE' ? 'image/jpeg' : 'audio/mp4' });
  expect(response.status).toBe(200);
  return response.body.key as string;
}

describe('authorized chat-media routes, messages and retention', () => {
  it.each(['IMAGE', 'VOICE'] as const)(
    'allows own %s send and party-only signed download',
    async (type) => {
      const f = await fixture();
      const key = await issue(f, type);
      expect(storage.presignUpload).toHaveBeenCalledWith(
        key,
        type === 'IMAGE' ? 'image/jpeg' : 'audio/mp4',
      );
      const sent = await request(app)
        .post(`/api/bookings/${f.bookingId}/messages`)
        .set('Authorization', `Bearer ${f.token}`)
        .send({ contentType: type, content: key });
      expect(sent.status).toBe(201);
      const response = await request(app)
        .get(`/api/bookings/${f.bookingId}/messages/${sent.body.id}/media-url`)
        .set('Authorization', `Bearer ${f.usherToken}`);
      expect(response.status).toBe(200);
      expect(storage.presignDownload).toHaveBeenCalledWith(key);
    },
  );
  it('rejects a known KYC key and keys from another sender/booking or media purpose via REST', async () => {
    const f = await fixture();
    const own = await issue(f);
    const keys = [
      `verifications/${f.usherId}/id-${randomUUID()}.jpg`,
      chatMediaKey(f.bookingId, f.usherId, 'IMAGE', 'image/jpeg'),
      chatMediaKey(randomUUID(), f.clientId, 'IMAGE', 'image/jpeg'),
      chatMediaKey(f.bookingId, f.clientId, 'VOICE', 'audio/mp4'),
      `${own}?query=1`,
      `https://example.com/${own}`,
    ];
    for (const content of keys) {
      const response = await request(app)
        .post(`/api/bookings/${f.bookingId}/messages`)
        .set('Authorization', `Bearer ${f.token}`)
        .send({ contentType: 'IMAGE', content });
      expect(response.status).toBe(400);
    }
    expect(await prisma.message.count({ where: { conversationId: f.conversationId } })).toBe(0);
  });
  it('enforces media binding on socket submissions too', async () => {
    const f = await fixture();
    const server = createServer(app);
    const io = attachRealtime(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const socket = ioClient(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, {
      auth: { token: f.token },
      transports: ['websocket'],
    });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      const response = await new Promise<{ ok: boolean }>((resolve) =>
        socket.emit(
          'message:send',
          {
            bookingId: f.bookingId,
            contentType: 'IMAGE',
            content: `photos/${f.usherId}/avatar.jpg`,
          },
          resolve,
        ),
      );
      expect(response.ok).toBe(false);
      expect(await prisma.message.count({ where: { conversationId: f.conversationId } })).toBe(0);
    } finally {
      socket.close();
      await io.close();
    }
  });
  it('requires authentication, current party membership and messageable status before signing', async () => {
    const f = await fixture();
    const other = await fixture();
    const path = `/api/bookings/${f.bookingId}/media/upload-url`;
    expect(
      (await request(app).post(path).send({ contentType: 'IMAGE', mimeType: 'image/png' })).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post(path)
          .set('Authorization', `Bearer ${other.token}`)
          .send({ contentType: 'IMAGE', mimeType: 'image/png' })
      ).status,
    ).toBe(403);
    await prisma.booking.update({
      where: { id: f.bookingId },
      data: { status: 'PENDING_PAYMENT' },
    });
    expect(
      (
        await request(app)
          .post(path)
          .set('Authorization', `Bearer ${f.token}`)
          .send({ contentType: 'IMAGE', mimeType: 'image/png' })
      ).status,
    ).toBe(409);
    expect(storage.presignUpload).not.toHaveBeenCalled();
  });
  it('rejects mismatched MIME/purpose and unavailable storage', async () => {
    const f = await fixture();
    const path = `/api/bookings/${f.bookingId}/media/upload-url`;
    expect(
      (
        await request(app)
          .post(path)
          .set('Authorization', `Bearer ${f.token}`)
          .send({ contentType: 'VOICE', mimeType: 'image/png' })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(createApp())
          .post(path)
          .set('Authorization', `Bearer ${f.token}`)
          .send({ contentType: 'IMAGE', mimeType: 'image/png' })
      ).status,
    ).toBe(503);
    expect(storage.presignUpload).not.toHaveBeenCalled();
  });
  it('does not presign malicious legacy content or another conversation’s message', async () => {
    const f = await fixture();
    const other = await fixture();
    const legacy = await prisma.message.create({
      data: {
        conversationId: f.conversationId,
        senderId: f.clientId,
        contentType: 'IMAGE',
        content: `verifications/${f.usherId}/id-secret.jpg`,
      },
    });
    const good = await sendMessage({
      bookingId: other.bookingId,
      senderId: other.clientId,
      contentType: 'IMAGE',
      content: chatMediaKey(other.bookingId, other.clientId, 'IMAGE', 'image/jpeg'),
    });
    for (const id of [legacy.id, good.id])
      expect(
        (
          await request(app)
            .get(`/api/bookings/${f.bookingId}/messages/${id}/media-url`)
            .set('Authorization', `Bearer ${f.token}`)
        ).status,
      ).toBe(404);
    expect(
      (
        await request(app)
          .get(`/api/bookings/${other.bookingId}/messages/${good.id}/media-url`)
          .set('Authorization', `Bearer ${f.token}`)
      ).status,
    ).toBe(403);
    const history = await request(app)
      .get(`/api/bookings/${f.bookingId}/messages`)
      .set('Authorization', `Bearer ${f.token}`);
    expect(history.body[0].content).toBe('');
    await prisma.booking.update({ where: { id: other.bookingId }, data: { status: 'CANCELLED' } });
    expect(
      (
        await request(app)
          .get(`/api/bookings/${other.bookingId}/messages/${good.id}/media-url`)
          .set('Authorization', `Bearer ${other.token}`)
      ).status,
    ).toBe(409);
    expect(storage.presignDownload).not.toHaveBeenCalled();
  });
  it('retention deletes only correctly bound objects, skipping malicious legacy references', async () => {
    const f = await fixture(true);
    const outsider = await fixture();
    const ownKey = chatMediaKey(f.bookingId, f.clientId, 'IMAGE', 'image/jpeg');
    await sendMessage({
      bookingId: f.bookingId,
      senderId: f.clientId,
      contentType: 'IMAGE',
      content: ownKey,
    });
    const badKeys = [
      `verifications/${f.usherId}/id-secret.jpg`,
      `photos/${f.usherId}/avatar-secret.jpg`,
      chatMediaKey(outsider.bookingId, f.clientId, 'IMAGE', 'image/jpeg'),
      chatMediaKey(f.bookingId, f.usherId, 'IMAGE', 'image/jpeg'),
    ];
    await prisma.message.createMany({
      data: badKeys.map((content) => ({
        conversationId: f.conversationId,
        senderId: f.clientId,
        contentType: 'IMAGE',
        content,
      })),
    });
    await prisma.message.create({
      data: {
        conversationId: f.conversationId,
        senderId: outsider.clientId,
        contentType: 'IMAGE',
        content: chatMediaKey(f.bookingId, outsider.clientId, 'IMAGE', 'image/jpeg'),
      },
    });
    await jobRetentionPurge(storage);
    expect(storage.deleteObject.mock.calls).toEqual([[ownKey]]);
    expect(await prisma.message.count({ where: { conversationId: f.conversationId } })).toBe(0);
  });
  it.each(['client', 'usher'] as const)(
    'skips deletion when a legacy conversation %s no longer matches its booking',
    async (party) => {
      const f = await fixture(true);
      const other = await fixture();
      const otherBooking = await prisma.booking.findUniqueOrThrow({
        where: { id: other.bookingId },
        include: { event: true },
      });
      const key = chatMediaKey(f.bookingId, f.clientId, 'IMAGE', 'image/jpeg');
      await sendMessage({
        bookingId: f.bookingId,
        senderId: f.clientId,
        contentType: 'IMAGE',
        content: key,
      });
      await prisma.conversation.update({
        where: { id: f.conversationId },
        data:
          party === 'client'
            ? { clientId: otherBooking.event.clientId }
            : { usherId: otherBooking.usherId },
      });
      await jobRetentionPurge(storage);
      expect(storage.deleteObject).not.toHaveBeenCalled();
    },
  );
});
