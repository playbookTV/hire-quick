import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '@hq/database';
import { idempotencyStorageKey } from '../../payments/ledger/idempotency.js';
import { MAX_INT32_KOBO } from '@hq/shared';
import { assertDisposableDatabase } from '../../auth/__tests__/assert-disposable-db.js';
import { confirmBatch } from '../../bookings/service.js';
import { InMemoryPaystack } from '../../payments/port/paystack-port.js';
import { editEvent } from '../edit.js';

const users: string[] = [];
const events: string[] = [];
const keys: string[] = [];
let isolated = false;
beforeAll(async () => { await assertDisposableDatabase(); isolated = true; });
afterEach(async () => {
  if (!isolated) return;
  await prisma.booking.deleteMany({ where: { eventId: { in: events } } });
  await prisma.order.deleteMany({ where: { eventId: { in: events } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.idempotencyKey.deleteMany({ where: { key: { in: keys } } });
  users.length = 0; events.length = 0; keys.length = 0;
});
async function fixture() {
  const client = await prisma.user.create({ data: { phone: `event-client-${randomUUID()}`, role: 'CLIENT', status: 'ACTIVE', client: { create: { displayName: 'Fixture client' } } }, include: { client: true } });
  const usher = await prisma.user.create({ data: { phone: `event-usher-${randomUUID()}`, role: 'USHER', status: 'ACTIVE', usher: { create: { verificationStatus: 'VERIFIED' } } }, include: { usher: true } });
  users.push(client.id, usher.id);
  const event = await prisma.event.create({ data: { clientId: client.client!.id, title: 'Validation event', venue: 'Lagos venue', category: 'Wedding', eventDate: new Date('2027-06-01'), startTime: '10:00', endTime: '18:00', headcount: 2, budgetPerHead: 10000, status: 'OPEN', preferences: { hairstyle: 'braids', requirements: 'experience', extra: { keep: true } } } });
  events.push(event.id);
  const application = await prisma.application.create({ data: { eventId: event.id, usherId: usher.usher!.id, status: 'ACCEPTED' } });
  const key = randomUUID(); keys.push(`order:${key}`, idempotencyStorageKey(key, 'order', client.id));
  const params = { idempotencyKey: key, clientUserId: client.id, eventId: event.id, applicationIds: [application.id], email: 'checkout@example.com' };
  const paystack = new InMemoryPaystack();
  const initialize = vi.spyOn(paystack, 'initializeCharge');
  return { client, usher, event, application, params, paystack, initialize, deps: { prisma, paystack } };
}

describe('event edits and complete checkout selection', () => {
  it('validates one-field time edits, late accommodation and aggregate budget against the merged event', async () => {
    const f = await fixture();
    for (const patch of [{ startTime: '19:00' }, { endTime: '09:00' }, { endTime: '22:00' }, { budgetPerHeadKobo: MAX_INT32_KOBO }])
      await expect(editEvent(prisma, f.client.client!.id, f.client.id, f.event.id, patch)).rejects.toThrow();
    const unchanged = await prisma.event.findUniqueOrThrow({ where: { id: f.event.id } });
    expect([unchanged.startTime, unchanged.endTime, unchanged.budgetPerHead]).toEqual(['10:00', '18:00', 10000]);
    const updated = await editEvent(prisma, f.client.client!.id, f.client.id, f.event.id, { startTime: '11:00' });
    expect(updated.startTime).toBe('11:00');
  });

  it('preserves unmentioned preferences and clears only an explicitly empty field', async () => {
    const f = await fixture();
    const edit = (body: unknown) => editEvent(prisma, f.client.client!.id, f.client.id, f.event.id, body);
    expect((await edit({ requirements: 'new requirements' })).preferences).toEqual({ hairstyle: 'braids', requirements: 'new requirements', extra: { keep: true } });
    expect((await edit({ hairstyle: 'natural' })).preferences).toEqual({ hairstyle: 'natural', requirements: 'new requirements', extra: { keep: true } });
    expect((await edit({ requirements: '' })).preferences).toEqual({ hairstyle: 'natural', extra: { keep: true } });
    expect((await edit({ hairstyle: '' })).preferences).toEqual({ extra: { keep: true } });
  });

  it('rejects the entire batch when any requested application is missing or no longer accepted', async () => {
    const f = await fixture();
    await expect(confirmBatch(f.deps, { ...f.params, applicationIds: [f.application.id, randomUUID()] })).rejects.toMatchObject({ code: 'SELECTION_CHANGED' });
    await prisma.application.update({ where: { id: f.application.id }, data: { status: 'REJECTED' } });
    await expect(confirmBatch(f.deps, f.params)).rejects.toMatchObject({ code: 'SELECTION_CHANGED' });
    expect(await prisma.order.count({ where: { eventId: f.event.id } })).toBe(0);
    expect(f.initialize).not.toHaveBeenCalled();
  });

  it('deduplicates requested IDs before pricing and booking', async () => {
    const f = await fixture();
    const out = await confirmBatch(f.deps, { ...f.params, applicationIds: [f.application.id, f.application.id] });
    expect(out.bookingIds).toHaveLength(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: out.orderId } })).grossAmount).toBe(10000);
  });

  it('checks verification and account status before any checkout effect', async () => {
    const f = await fixture();
    await prisma.usher.update({ where: { id: f.usher.usher!.id }, data: { verificationStatus: 'REJECTED' } });
    await expect(confirmBatch(f.deps, f.params)).rejects.toMatchObject({ code: 'SELECTION_CHANGED' });
    await prisma.usher.update({ where: { id: f.usher.usher!.id }, data: { verificationStatus: 'VERIFIED' } });
    await prisma.user.update({ where: { id: f.usher.id }, data: { status: 'SUSPENDED' } });
    await expect(confirmBatch(f.deps, f.params)).rejects.toMatchObject({ code: 'SELECTION_CHANGED' });
    expect(f.initialize).not.toHaveBeenCalled();
    expect(await prisma.booking.count({ where: { eventId: f.event.id } })).toBe(0);
  });

  it('re-reads application eligibility after waiting for the confirmation lock', async () => {
    const f = await fixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let locked!: (pid: number) => void;
    const ready = new Promise<number>((resolve) => { locked = resolve; });
    const holder = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM events WHERE id = ${f.event.id}::uuid FOR UPDATE`;
      const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      locked(row!.pid);
      await gate;
      await tx.application.update({ where: { id: f.application.id }, data: { status: 'REJECTED' } });
    }, { timeout: 30000, maxWait: 30000 });
    const pid = await ready;
    const pending = confirmBatch(f.deps, f.params);
    const assertion = expect(pending).rejects.toMatchObject({ code: 'SELECTION_CHANGED' });
    try {
      let waiting = false;
      for (let attempt = 0; attempt < 30 && !waiting; attempt++) {
        const rows = await prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))) AS waiting`;
        waiting = rows[0]?.waiting === true;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(waiting).toBe(true);
    } finally { release(); await holder; }
    await assertion;
    expect(f.initialize).not.toHaveBeenCalled();
  });

  it('serializes event edits with confirmation and always uses committed pricing', async () => {
    const f = await fixture();
    const [edit, confirmed] = await Promise.allSettled([
      editEvent(prisma, f.client.client!.id, f.client.id, f.event.id, { budgetPerHeadKobo: 20000 }),
      confirmBatch(f.deps, f.params),
    ]);
    expect(confirmed.status).toBe('fulfilled');
    const order = await prisma.order.findFirstOrThrow({ where: { eventId: f.event.id } });
    expect(order.grossAmount).toBe(edit.status === 'fulfilled' ? 20000 : 10000);
    if (edit.status === 'rejected') expect(edit.reason).toMatchObject({ code: 'EVENT_LOCKED' });
    await expect(editEvent(prisma, f.client.client!.id, f.client.id, f.event.id, { title: 'Too late' })).rejects.toMatchObject({ code: 'EVENT_LOCKED' });
  });

  it('rejects changed payloads while concurrent first use safely returns the same order', async () => {
    const f = await fixture();
    const out = await Promise.all([confirmBatch(f.deps, f.params), confirmBatch(f.deps, f.params)]);
    expect(out[0]!.orderId).toBe(out[1]!.orderId);
    expect(out.map((x) => x.duplicate).sort()).toEqual([false, true]);
    await expect(confirmBatch(f.deps, { ...f.params, email: 'changed@example.com' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(confirmBatch(f.deps, { ...f.params, applicationIds: [randomUUID()] })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(await prisma.order.count({ where: { eventId: f.event.id } })).toBe(1);
  });

  it('isolates caller keys and never discloses a foreign legacy response', async () => {
    const a = await fixture(); const b = await fixture();
    const first = await confirmBatch(a.deps, a.params);
    await prisma.idempotencyKey.create({ data: { key: `order:${a.params.idempotencyKey}`, scope: 'order', response: { orderId: first.orderId, bookingIds: first.bookingIds } } });
    keys.push(idempotencyStorageKey(a.params.idempotencyKey, 'order', b.client.id));
    const second = await confirmBatch(b.deps, { ...b.params, idempotencyKey: a.params.idempotencyKey });
    expect(second.orderId).not.toBe(first.orderId);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: second.orderId } })).clientId).toBe(b.client.client!.id);
  });

  it('refuses to guess an owner legacy fingerprint and creates no replacement checkout', async () => {
    const f = await fixture();
    const original = await confirmBatch(f.deps, f.params);
    await prisma.idempotencyKey.delete({ where: { key: idempotencyStorageKey(f.params.idempotencyKey, 'order', f.client.id) } });
    await prisma.idempotencyKey.create({ data: { key: `order:${f.params.idempotencyKey}`, scope: 'order', response: { orderId: original.orderId, bookingIds: original.bookingIds } } });
    await expect(confirmBatch(f.deps, f.params)).rejects.toMatchObject({ code: 'LEGACY_IDEMPOTENCY_CONFLICT' });
    expect(await prisma.order.count({ where: { eventId: f.event.id } })).toBe(1);
    expect(f.initialize).toHaveBeenCalledTimes(1);
  });

  it('retains order and provider reference after an uncertain checkout response', async () => {
    const f = await fixture();
    f.initialize.mockRejectedValueOnce(new Error('connection lost'));
    const original = await confirmBatch(f.deps, f.params);
    expect(original.state).toBe('REVIEW');
    const retried = await confirmBatch(f.deps, f.params);
    expect(retried.duplicate).toBe(true);
    expect(retried.orderId).toBe(original.orderId);
    expect(retried.reference).toBe(original.reference);
    expect(retried.state).toBe('REVIEW');
    expect(f.initialize).toHaveBeenCalledTimes(1); // uncertain initialization is never dispatched twice
    expect(await prisma.order.count({ where: { eventId: f.event.id } })).toBe(1);
  });
});
