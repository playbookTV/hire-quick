import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { prisma } from '@hq/database';
import { withdrawalResponseSchema } from '@hq/shared';
import { createApp } from '../../../app.js';
import { signAccessToken } from '../../auth/tokens.js';
import { noopGateway } from '../../../realtime/gateway.js';
import { RT } from '../../../realtime/events.js';
import { holdOrder, markCheckedIn, releaseBooking, requestWithdrawal, failWithdrawal } from '../ledger/ledger.js';
import { idempotencyStorageKey, runIdempotent } from '../ledger/idempotency.js';
import { initWithdrawal } from '../service.js';
import { InMemoryPaystack } from '../port/paystack-port.js';
import { createScenario, teardown, type Scenario } from './fixtures.js';

const scenarios: Scenario[] = [];
const keys: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await prisma.idempotencyKey.deleteMany({ where: { key: { in: keys.splice(0) } } });
  for (const scenario of scenarios.splice(0)) await teardown(scenario);
});

async function fundedWallet(key = randomUUID()) {
  const s = await createScenario({ headcount: 1, amountKobo: 1_000_000 });
  scenarios.push(s);
  await prisma.$transaction(async (tx) => {
    await holdOrder(tx, s.orderId, `hq_${s.orderId}`);
    await markCheckedIn(tx, s.bookingIds[0]!, 'AUTO');
    await releaseBooking(tx, s.bookingIds[0]!, 'AUTO');
  });
  const bank = await prisma.bankAccount.create({ data: {
    usherId: s.usherId, verified: true, bankCode: '058', accountNumber: '0000000000',
    accountName: 'Withdrawal test', paystackRecipientCode: 'rcp_test',
  } });
  keys.push(idempotencyStorageKey(key, 'withdrawal', s.usherId));
  return { s, bank, params: {
    idempotencyKey: key, usherId: s.usherId, walletId: s.walletId,
    bankAccountId: bank.id, amountKobo: 100_000,
  } };
}

describe('withdrawal request binding and persisted outcomes', () => {
  it.each([
    ['success', 'PAID', 750_000],
    ['pending', 'PROCESSING', 750_000],
    ['unknown', 'PROCESSING', 750_000],
    ['failed', 'FAILED', 850_000],
  ] as const)('HTTP %s returns %s and the actual wallet balance', async (providerStatus, status, balance) => {
    const { s, params } = await fundedWallet();
    const paystack = new InMemoryPaystack();
    vi.spyOn(paystack, 'transfer').mockResolvedValue({ status: providerStatus, reference: 'ignored' });
    const emitToUser = vi.fn();
    const app = createApp({ paystack, realtime: { ...noopGateway, emitToUser } });
    const res = await request(app).post('/api/payments/withdrawals')
      .set('Authorization', `Bearer ${await signAccessToken(s.usherUserId, 'USHER')}`)
      .set('Idempotency-Key', params.idempotencyKey)
      .send({ bankAccountId: params.bankAccountId, amountKobo: params.amountKobo });
    expect(res.status).toBe(201);
    const outcome = withdrawalResponseSchema.parse(res.body);
    expect(outcome).toMatchObject({ status, availableBalance: balance, amountKobo: 100_000, duplicate: false });
    expect(emitToUser).toHaveBeenCalledWith(s.usherUserId, RT.WITHDRAWAL_REQUESTED,
      expect.objectContaining({ status, amountKobo: 100_000, withdrawalId: outcome.withdrawalId }));
  });

  it('replays concurrent requests with one debit and one provider transfer', async () => {
    const { s, params } = await fundedWallet();
    const paystack = new InMemoryPaystack();
    let release!: () => void;
    let entered!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const originalTransfer = paystack.transfer.bind(paystack);
    const send = vi.spyOn(paystack, 'transfer').mockImplementation(async input => {
      entered();
      await held;
      return originalTransfer(input);
    });
    const first = initWithdrawal({ prisma, paystack }, params);
    let concurrent: Promise<Awaited<typeof first>[]> | undefined;
    let responses: Awaited<typeof first>[];
    try {
      await Promise.race([started, first.then(() => { throw new Error('First request finished before dispatch barrier'); })]);
      concurrent = Promise.all(Array.from({ length: 2 }, () => initWithdrawal({ prisma, paystack }, params)));
      const waiting = await concurrent;
      expect(waiting.every(response => response.status === 'PROCESSING')).toBe(true);
      expect(send).toHaveBeenCalledTimes(1);
      release();
      responses = [await first, ...waiting];
    } finally {
      release();
      await Promise.allSettled([first, ...(concurrent ? [concurrent] : [])]);
    }
    expect(new Set(responses.map((r) => r.withdrawalId)).size).toBe(1);
    expect(responses.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await prisma.walletLedger.count({ where: { walletId: s.walletId, entryType: 'DEBIT' } })).toBe(1);
  });

  it('rejects changed amount and changed destination on the same key', async () => {
    const { s, params } = await fundedWallet();
    const deps = { prisma, paystack: new InMemoryPaystack() };
    await initWithdrawal(deps, params);
    const another = await prisma.bankAccount.create({ data: {
      usherId: s.usherId, verified: true, bankCode: '058', accountNumber: '1111111111',
      accountName: 'Another destination', paystackRecipientCode: 'rcp_another',
    } });
    for (const changed of [{ amountKobo: 200_000 }, { bankAccountId: another.id }]) {
      await expect(initWithdrawal(deps, { ...params, ...changed })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    }
    expect(await prisma.withdrawal.count({ where: { walletId: s.walletId } })).toBe(1);
  });

  it('isolates identical keys across two callers', async () => {
    const key = randomUUID();
    const a = await fundedWallet(key);
    const b = await fundedWallet(key);
    const deps = { prisma, paystack: new InMemoryPaystack() };
    const [first, second] = await Promise.all([initWithdrawal(deps, a.params), initWithdrawal(deps, b.params)]);
    expect(second.withdrawalId).not.toBe(first.withdrawalId);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(false);
  });

  it('replays matching legacy requests, rejects owner changes, and ignores foreign legacy results', async () => {
    const key = randomUUID();
    const owner = await fundedWallet(key);
    const foreign = await fundedWallet(key);
    const legacyId = await prisma.$transaction((tx) => requestWithdrawal(tx,
      owner.params.walletId, owner.params.bankAccountId, owner.params.amountKobo));
    const legacyKey = idempotencyStorageKey(key, 'withdrawal');
    keys.push(legacyKey);
    await prisma.idempotencyKey.create({ data: { key: legacyKey, scope: 'withdrawal', response: legacyId } });
    const deps = { prisma, paystack: new InMemoryPaystack() };
    await expect(initWithdrawal(deps, { ...owner.params, amountKobo: 200_000 })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const other = await initWithdrawal(deps, foreign.params);
    expect(other.withdrawalId).not.toBe(legacyId);
    const replay = await initWithdrawal(deps, owner.params);
    expect(replay).toMatchObject({ duplicate: true, withdrawalId: legacyId, status: 'PAID', availableBalance: 750_000 });
    expect(await prisma.withdrawal.count({ where: { walletId: owner.s.walletId } })).toBe(1);
  });

  it('returns the persisted failure when a callback beats a successful dispatch response', async () => {
    const { params } = await fundedWallet();
    const paystack = new InMemoryPaystack();
    vi.spyOn(paystack, 'transfer').mockImplementation(async ({ reference }) => {
      await prisma.$transaction((tx) => failWithdrawal(tx, reference.slice(3)));
      return { status: 'success', reference };
    });
    const out = await initWithdrawal({ prisma, paystack }, params);
    expect(out).toMatchObject({ status: 'FAILED', availableBalance: 850_000 });
  });

  it('refreshes replayed terminal status after a completed transfer is reversed', async () => {
    const { params } = await fundedWallet();
    const deps = { prisma, paystack: new InMemoryPaystack() };
    const first = await initWithdrawal(deps, params);
    expect(first.status).toBe('PAID');
    await prisma.$transaction((tx) => failWithdrawal(tx, first.withdrawalId));
    const second = await initWithdrawal(deps, params);
    expect(second).toMatchObject({ withdrawalId: first.withdrawalId, duplicate: true, status: 'FAILED', availableBalance: 850_000 });
  });

  it('preserves unbound callers and serializes their concurrent first use', async () => {
    const key = randomUUID();
    keys.push(idempotencyStorageKey(key, 'test'));
    const effect = vi.fn(async () => ({ id: randomUUID() }));
    const out = await Promise.all(Array.from({ length: 3 }, () => runIdempotent(prisma, key, 'test', effect)));
    expect(effect).toHaveBeenCalledTimes(1);
    expect(out.every((r) => r.result?.id === out[0]!.result?.id)).toBe(true);
    expect(out.filter((r) => !r.duplicate)).toHaveLength(1);
  });
});
