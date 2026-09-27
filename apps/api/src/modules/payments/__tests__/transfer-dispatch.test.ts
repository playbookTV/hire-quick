import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma, type Prisma } from '@hq/database';
import { assertDisposableDatabase } from '../../auth/__tests__/assert-disposable-db.js';
import { claimTransferDispatch, releaseTransferDispatch } from '../transfer-dispatch.js';
import { driveTransfer } from '../service.js';
import { InMemoryPaystack } from '../port/paystack-port.js';

const ids: string[] = [];
let validated = false;
beforeAll(async () => { await assertDisposableDatabase(); validated = true; });
afterEach(async () => {
  vi.restoreAllMocks();
  if (validated) await prisma.paymentOperation.deleteMany({ where: { id: { in: ids.splice(0) } } });
});

async function operation(extra: Prisma.InputJsonObject = {}) {
  const reference = `sweep_${randomUUID()}`;
  const op = await prisma.paymentOperation.create({ data: {
    kind: 'COMMISSION_SWEEP', dedupeKey: `COMMISSION_SWEEP:${randomUUID()}`,
    payload: { amountKobo: 100, recipientCode: 'rcp_test', reference, ...extra },
  } });
  ids.push(op.id);
  return op;
}

describe('durable transfer dispatch exclusion', () => {
  it('leaves busy claims unchanged and prevents the expired owner clearing a replacement lease', async () => {
    const op = await operation();
    const first = await claimTransferDispatch(prisma, op.id);
    expect(first.state).toBe('claimed');
    if (first.state !== 'claimed') throw new Error('Expected initial claim');
    const busy = await Promise.all(Array.from({ length: 3 }, () => claimTransferDispatch(prisma, op.id)));
    expect(busy).toEqual([{ state: 'busy' }, { state: 'busy' }, { state: 'busy' }]);
    expect(await prisma.paymentOperation.findUniqueOrThrow({ where: { id: op.id } })).toMatchObject({
      attempts: first.op.attempts, updatedAt: first.op.updatedAt, payload: first.op.payload,
    });
    await prisma.paymentOperation.update({ where: { id: op.id }, data: {
      payload: { ...(op.payload as Prisma.InputJsonObject), dispatchLease: { owner: first.owner, expiresAt: 1 } },
    } });
    const next = await claimTransferDispatch(prisma, op.id);
    if (next.state !== 'claimed') throw new Error('Expected replacement claim');
    expect(next.owner).not.toBe(first.owner);
    await releaseTransferDispatch(prisma, op.id, first.owner);
    expect((await prisma.paymentOperation.findUniqueOrThrow({ where: { id: op.id } })).payload)
      .toEqual(next.op.payload);
    await releaseTransferDispatch(prisma, op.id, next.owner);
    expect((await prisma.paymentOperation.findUniqueOrThrow({ where: { id: op.id } })).payload).toEqual(op.payload);
  });

  it('recovers an expired owner by verifying then reissuing the stored reference and payload', async () => {
    const op = await operation({ dispatchLease: { owner: randomUUID(), expiresAt: 1 } });
    const payload = op.payload as Prisma.InputJsonObject;
    const paystack = new InMemoryPaystack();
    const verify = vi.spyOn(paystack, 'verifyTransfer').mockResolvedValue({ status: 'unknown' });
    const transfer = vi.spyOn(paystack, 'transfer').mockResolvedValue({ status: 'pending', reference: String(payload.reference) });
    const stale = { ...op, payload: { ...payload, amountKobo: 999, reference: 'stale-reference', recipientCode: 'stale-recipient' } };
    expect(await driveTransfer({ prisma, paystack }, stale)).toMatchObject({ status: 'PENDING' });
    expect(verify).toHaveBeenCalledWith(payload.reference);
    expect(transfer).toHaveBeenCalledTimes(1);
    expect(transfer).toHaveBeenCalledWith({
      amountKobo: 100, recipientCode: 'rcp_test', reference: payload.reference, reason: 'HireQuick commission sweep',
    });
    expect(verify.mock.invocationCallOrder[0]).toBeLessThan(transfer.mock.invocationCallOrder[0]!);
    const current = await prisma.paymentOperation.findUniqueOrThrow({ where: { id: op.id } });
    expect(current.payload).not.toHaveProperty('dispatchLease');
    expect(current.providerRef).toBe(payload.reference);
  });

  it('does not dispatch after an operation becomes terminal during verification or from a stale caller', async () => {
    const op = await operation();
    const paystack = new InMemoryPaystack();
    const verify = vi.spyOn(paystack, 'verifyTransfer').mockImplementation(async () => {
      await prisma.paymentOperation.update({ where: { id: op.id }, data: { status: 'FAILED' } });
      return { status: 'unknown' };
    });
    const transfer = vi.spyOn(paystack, 'transfer');
    expect(await driveTransfer({ prisma, paystack }, op)).toMatchObject({ status: 'FAILED' });
    expect(await driveTransfer({ prisma, paystack }, op)).toMatchObject({ status: 'FAILED' });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(transfer).not.toHaveBeenCalled();
  });

  it('does not dispatch or clear another owner when its lease is reclaimed during verification', async () => {
    const op = await operation();
    const paystack = new InMemoryPaystack();
    let replacement: Prisma.JsonValue | undefined;
    vi.spyOn(paystack, 'verifyTransfer').mockImplementation(async () => {
      const row = await prisma.paymentOperation.findUniqueOrThrow({ where: { id: op.id } });
      const payload = row.payload as Prisma.InputJsonObject;
      await prisma.paymentOperation.update({ where: { id: op.id }, data: {
        payload: { ...payload, dispatchLease: { owner: (payload.dispatchLease as Prisma.InputJsonObject).owner!, expiresAt: 1 } },
      } });
      const next = await claimTransferDispatch(prisma, op.id);
      if (next.state !== 'claimed') throw new Error('Expected replacement claim');
      replacement = next.op.payload;
      return { status: 'unknown' };
    });
    const transfer = vi.spyOn(paystack, 'transfer');
    expect(await driveTransfer({ prisma, paystack }, op)).toMatchObject({ status: 'PENDING' });
    expect(transfer).not.toHaveBeenCalled();
    expect((await prisma.paymentOperation.findUniqueOrThrow({ where: { id: op.id } })).payload).toEqual(replacement);
  });

  it('fails closed on malformed lease metadata without provider calls', async () => {
    const op = await operation({ dispatchLease: { owner: 'invalid-owner', expiresAt: Date.now() + 300_000 } });
    const paystack = new InMemoryPaystack();
    const verify = vi.spyOn(paystack, 'verifyTransfer');
    const transfer = vi.spyOn(paystack, 'transfer');
    await expect(driveTransfer({ prisma, paystack }, op)).rejects.toThrow('Invalid transfer dispatch lease');
    expect(verify).not.toHaveBeenCalled();
    expect(transfer).not.toHaveBeenCalled();
    expect((await prisma.paymentOperation.findUniqueOrThrow({ where: { id: op.id } })).payload).toEqual(op.payload);
  });
});
