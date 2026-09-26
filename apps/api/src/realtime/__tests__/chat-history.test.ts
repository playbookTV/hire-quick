import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@hq/database';
import { createApp } from '../../app.js';
import { listMessagePage, markSeen, sendMessage } from '../messages.js';
import { socketToken } from './session-fixture.js';
import {
  createScenario,
  teardown,
  type Scenario,
} from '../../modules/payments/__tests__/fixtures.js';
import { holdOrder } from '../../modules/payments/ledger/ledger.js';

let scenario: Scenario;
let conversationId: string;
let bookingId: string;
const ids = Array.from(
  { length: 125 },
  (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
);
beforeAll(async () => {
  scenario = await createScenario({ headcount: 2, amountKobo: 2_000_000 });
  bookingId = scenario.bookingIds[0]!;
  await prisma.$transaction((tx) => holdOrder(tx, scenario.orderId, randomUUID()));
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { event: true },
  });
  const conversation = await prisma.conversation.create({
    data: { bookingId, clientId: booking.event.clientId, usherId: booking.usherId },
  });
  conversationId = conversation.id;
  await prisma.message.createMany({
    data: ids.map((id) => ({
      id,
      conversationId,
      senderId: scenario.clientUserId,
      content: `message-${id}`,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })),
  });
});
afterAll(async () => {
  if (scenario) {
    await prisma.conversation.deleteMany({ where: { bookingId: { in: scenario.bookingIds } } });
    await teardown(scenario);
  }
});

describe('bounded booking history and duplicate-safe sends', () => {
  it('paginates equal timestamps without gaps or repeats in both directions', async () => {
    const first = await listMessagePage(bookingId, scenario.clientUserId, { limit: 50 });
    const second = await listMessagePage(bookingId, scenario.clientUserId, {
      before: first.oldestCursor,
      limit: 50,
    });
    const third = await listMessagePage(bookingId, scenario.clientUserId, {
      before: second.oldestCursor,
      limit: 50,
    });
    expect([...third.items, ...second.items, ...first.items].map((item) => item.id)).toEqual(ids);
    expect([first.hasMore, second.hasMore, third.hasMore]).toEqual([true, true, false]);
    const after = await listMessagePage(bookingId, scenario.clientUserId, {
      after: ids[49],
      limit: 50,
    });
    expect(after.items.map((item) => item.id)).toEqual(ids.slice(50, 100));
    expect(after.hasMore).toBe(true);
  });
  it('rejects non-parties and cross-conversation cursors', async () => {
    await expect(listMessagePage(bookingId, randomUUID(), {})).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    const foreign = await sendMessage({
      bookingId: scenario.bookingIds[1]!,
      senderId: scenario.clientUserId,
      content: 'Other conversation',
    });
    await expect(
      listMessagePage(bookingId, scenario.clientUserId, { after: foreign.id }),
    ).rejects.toMatchObject({ code: 'INVALID_MESSAGE_CURSOR' });
    await expect(markSeen(bookingId, scenario.usherUserId, foreign.id)).rejects.toMatchObject({
      code: 'INVALID_MESSAGE_CURSOR',
    });
  });
  it('marks exactly through a tied cursor and returns only authorized receipts', async () => {
    expect(await markSeen(bookingId, scenario.usherUserId, ids[49])).toBe(50);
    const result = await listMessagePage(bookingId, scenario.clientUserId, {
      after: ids.at(-1),
      receiptIds: `${ids[49]},${ids[50]},${randomUUID()}`,
    });
    expect(result.receipts.map((item) => item.id)).toEqual([ids[49]]);
    expect(result.items).toEqual([]);
  });
  it('concurrent retries create one message and reject changed content or sender', async () => {
    const clientMessageId = randomUUID();
    const input = {
      clientMessageId,
      bookingId,
      senderId: scenario.clientUserId,
      content: 'Only once',
    };
    const results = await Promise.all([sendMessage(input), sendMessage(input), sendMessage(input)]);
    expect(new Set(results.map((item) => item.id))).toEqual(new Set([clientMessageId]));
    expect(await prisma.message.count({ where: { id: clientMessageId } })).toBe(1);
    await expect(sendMessage({ ...input, content: 'Changed' })).rejects.toMatchObject({
      code: 'MESSAGE_ID_CONFLICT',
    });
    await expect(sendMessage({ ...input, senderId: scenario.usherUserId })).rejects.toMatchObject({
      code: 'MESSAGE_ID_CONFLICT',
    });
  });
  it('serializes concurrent appends into strict timestamp order for incremental reads', async () => {
    const sent = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        sendMessage({ bookingId, senderId: scenario.clientUserId, content: `Concurrent ${i}` }),
      ),
    );
    expect(new Set(sent.map((item) => item.createdAt.getTime())).size).toBe(5);
    const sorted = sent.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const result = await listMessagePage(bookingId, scenario.clientUserId, {
      after: sorted[0]!.id,
    });
    expect(result.items.map((item) => item.id)).toEqual(sorted.slice(1).map((item) => item.id));
  });
  it('exposes the page contract and caps the legacy array endpoint', async () => {
    const app = createApp();
    const token = await socketToken(scenario.clientUserId, 'CLIENT');
    const paged = await request(app)
      .get(`/api/bookings/${bookingId}/messages/page?limit=20`)
      .auth(token, { type: 'bearer' });
    expect(paged.status).toBe(200);
    expect(paged.body.items).toHaveLength(20);
    const legacy = await request(app)
      .get(`/api/bookings/${bookingId}/messages`)
      .auth(token, { type: 'bearer' });
    expect(legacy.body).toHaveLength(100);
    expect(
      (
        await request(app)
          .get(`/api/bookings/${bookingId}/messages/page?limit=999`)
          .auth(token, { type: 'bearer' })
      ).status,
    ).toBe(400);
  });
});
