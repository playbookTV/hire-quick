/** Weekly payout runs: snapshot, maker-checker, execution, OTP finalize and settlement. */
import { createHmac, randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@hq/database';
import { PAYOUT_MIN_KOBO } from '@hq/shared';
import { createApp } from '../../../app.js';
import { env } from '../../../env.js';
import { signAccessToken } from '../../auth/tokens.js';
import { holdOrder, markCheckedIn, releaseBooking } from '../ledger/ledger.js';
import { InMemoryPaystack } from '../port/paystack-port.js';
import {
  approvePayoutRun,
  buildPayoutRun,
  dispatchPayoutRun,
  executePayoutRun,
  rejectPayoutRun,
  submitPayoutOtp,
  submitPayoutRun,
} from '../payout-runs.js';
import { setPayoutAccount } from '../service.js';
import { createScenario, teardown, type Scenario } from './fixtures.js';

const SECRET = 'payout_run_webhook_secret';
const scenarios: Scenario[] = [];
const adminIds: string[] = [];
const runIds: string[] = [];

afterEach(async () => {
  env.PAYOUT_MODE = 'on_demand';
  const runs = await prisma.payoutRun.findMany({
    where: { id: { in: runIds.splice(0) } },
    select: { id: true },
  });
  for (const s of scenarios.splice(0)) {
    await prisma.notification.deleteMany({ where: { userId: s.usherUserId } });
    await prisma.usher.update({ where: { id: s.usherId }, data: { payoutBankAccountId: null } });
    await teardown(s);
  }
  await prisma.payoutRun.deleteMany({ where: { id: { in: runs.map((r) => r.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: adminIds.splice(0) } } });
});

async function admin(): Promise<string> {
  const user = await prisma.user.create({
    data: { role: 'ADMIN', phone: `+234776${randomUUID().slice(0, 8)}`, status: 'ACTIVE' },
  });
  adminIds.push(user.id);
  return user.id;
}

/** An usher whose wallet holds `amountKobo` of released pay, with an optional payout account. */
async function fundedUsher(amountKobo: number, opts: { payoutAccount?: boolean } = {}) {
  const s = await createScenario({ headcount: 1, amountKobo });
  scenarios.push(s);
  await prisma.$transaction(async (tx) => {
    await holdOrder(tx, s.orderId, `hq_${s.orderId}`);
    await markCheckedIn(tx, s.bookingIds[0]!, 'AUTO');
    await releaseBooking(tx, s.bookingIds[0]!, 'AUTO');
  });
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: s.walletId } });
  let bankId: string | null = null;
  if (opts.payoutAccount !== false) {
    const bank = await prisma.bankAccount.create({
      data: {
        usherId: s.usherId,
        verified: true,
        bankCode: '058',
        accountNumber: '0123456789',
        accountName: 'Payout Test',
        paystackRecipientCode: `rcp_${s.usherId.slice(0, 8)}`,
      },
    });
    await setPayoutAccount(prisma, s.usherId, bank.id);
    // Chosen long ago, so the line is not flagged as a new account.
    await prisma.usher.update({
      where: { id: s.usherId },
      data: { payoutAccountSetAt: new Date('2026-01-01T00:00:00Z') },
    });
    bankId = bank.id;
  }
  return { s, balance: wallet.availableBalance, bankId };
}

async function approvedRun(now: Date) {
  const run = await buildPayoutRun(prisma, { now });
  runIds.push(run.id);
  const [maker, checker] = [await admin(), await admin()];
  await submitPayoutRun(prisma, maker, run.id, run.linesHash);
  await approvePayoutRun(prisma, checker, run.id, run.linesHash);
  return run;
}

describe('building a payout run', () => {
  it('pays whole balances to payout accounts and explains every exclusion', async () => {
    const paid = await fundedUsher(2_000_000);
    const noAccount = await fundedUsher(2_000_000, { payoutAccount: false });
    const small = await fundedUsher(50_000);
    expect(small.balance).toBeLessThan(PAYOUT_MIN_KOBO);

    const run = await buildPayoutRun(prisma, { now: new Date('2031-01-02T08:00:00Z') });
    runIds.push(run.id);
    expect(run.status).toBe('DRAFT');
    expect(run.periodKey).toBe('2031-01-02');
    const lines = run.lines as { usherId: string; amountKobo: number; flags: string[] }[];
    const excluded = run.excluded as { usherId: string; reason: string }[];
    expect(lines.find((l) => l.usherId === paid.s.usherId)).toMatchObject({
      amountKobo: paid.balance,
      flags: ['FIRST_PAYOUT'],
    });
    expect(excluded.find((e) => e.usherId === noAccount.s.usherId)?.reason).toBe('NO_PAYOUT_ACCOUNT');
    expect(excluded.find((e) => e.usherId === small.s.usherId)?.reason).toBe('BELOW_MINIMUM');
    // Building moves no money.
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: paid.s.walletId } });
    expect(wallet.availableBalance).toBe(paid.balance);
  });

  it('flags a payout account chosen within the review window', async () => {
    const { s } = await fundedUsher(2_000_000);
    const now = new Date('2031-01-09T08:00:00Z');
    await prisma.usher.update({
      where: { id: s.usherId },
      data: { payoutAccountSetAt: new Date(now.getTime() - 2 * 86_400_000) },
    });
    const run = await buildPayoutRun(prisma, { now });
    runIds.push(run.id);
    const line = (run.lines as { usherId: string; flags: string[] }[]).find((l) => l.usherId === s.usherId);
    expect(line?.flags).toEqual(['NEW_PAYOUT_ACCOUNT', 'FIRST_PAYOUT']);
  });
});

describe('maker-checker', () => {
  it('needs a different admin to approve exactly the submitted lines', async () => {
    await fundedUsher(2_000_000);
    const run = await buildPayoutRun(prisma, { now: new Date('2031-01-16T08:00:00Z') });
    runIds.push(run.id);
    const [maker, checker] = [await admin(), await admin()];
    await expect(submitPayoutRun(prisma, maker, run.id, 'f'.repeat(64))).rejects.toMatchObject({
      code: 'RUN_CHANGED',
    });
    await submitPayoutRun(prisma, maker, run.id, run.linesHash);
    await expect(approvePayoutRun(prisma, maker, run.id, run.linesHash)).rejects.toMatchObject({
      code: 'SAME_ADMIN',
    });
    // Rejecting returns the run to DRAFT; it can then be rebuilt and resubmitted.
    await rejectPayoutRun(prisma, checker, run.id);
    await expect(approvePayoutRun(prisma, checker, run.id, run.linesHash)).rejects.toMatchObject({
      code: 'RUN_STATE',
    });
    const rebuilt = await buildPayoutRun(prisma, { now: new Date('2031-01-16T08:30:00Z') });
    expect(rebuilt.id).toBe(run.id);
    await submitPayoutRun(prisma, maker, run.id, rebuilt.linesHash);
    const approved = await approvePayoutRun(prisma, checker, run.id, rebuilt.linesHash);
    expect(approved.status).toBe('APPROVED');
  });

  it('blocks a new run while an earlier one awaits approval', async () => {
    await fundedUsher(2_000_000);
    const first = await buildPayoutRun(prisma, { now: new Date('2031-01-23T08:00:00Z') });
    runIds.push(first.id);
    await submitPayoutRun(prisma, await admin(), first.id, first.linesHash);
    await expect(
      buildPayoutRun(prisma, { now: new Date('2031-01-30T08:00:00Z') }),
    ).rejects.toMatchObject({ code: 'RUN_IN_PROGRESS' });
  });
});

describe('executing and settling a run', () => {
  it('debits each wallet once and links one withdrawal per line', async () => {
    const { s, balance } = await fundedUsher(2_000_000);
    const run = await approvedRun(new Date('2031-02-06T08:00:00Z'));
    const first = await executePayoutRun(prisma, run.id);
    expect(first.created).toBeGreaterThanOrEqual(1);
    const again = await executePayoutRun(prisma, run.id);
    expect(again.created).toBe(0);

    const withdrawals = await prisma.withdrawal.findMany({ where: { walletId: s.walletId } });
    expect(withdrawals).toHaveLength(1);
    expect(withdrawals[0]).toMatchObject({ payoutRunId: run.id, amount: balance, status: 'PROCESSING' });
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: s.walletId } });
    expect(wallet.availableBalance).toBe(0);
    const op = await prisma.paymentOperation.findUnique({
      where: { dedupeKey: `WITHDRAWAL_TRANSFER:${withdrawals[0]!.id}` },
    });
    expect(op?.status).toBe('PENDING');
    const executed = await prisma.payoutRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(executed.status).toBe('EXECUTED');
  });

  it('skips a line whose usher was suspended after approval and leaves the balance', async () => {
    const { s, balance } = await fundedUsher(2_000_000);
    const run = await approvedRun(new Date('2031-02-13T08:00:00Z'));
    await prisma.user.update({ where: { id: s.usherUserId }, data: { status: 'SUSPENDED' } });
    const out = await executePayoutRun(prisma, run.id);
    expect(out.skipped.find((k) => k.usherId === s.usherId)?.reason).toBe('USER_SUSPENDED');
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: s.walletId } });
    expect(wallet.availableBalance).toBe(balance);
    expect(await prisma.withdrawal.count({ where: { walletId: s.walletId } })).toBe(0);
  });

  it('waits for the owner OTP, then settles by webhook and tells the usher', async () => {
    const { s, balance } = await fundedUsher(2_000_000);
    const paystack = new InMemoryPaystack();
    paystack.requireTransferOtp('246810');
    const run = await approvedRun(new Date('2031-02-20T08:00:00Z'));
    await executePayoutRun(prisma, run.id);
    const dispatched = await dispatchPayoutRun({ prisma, paystack }, run.id);
    expect(dispatched.pending).toBeGreaterThanOrEqual(1);
    const w = await prisma.withdrawal.findFirstOrThrow({ where: { walletId: s.walletId } });
    expect(w.status).toBe('PROCESSING');

    const officer = await admin();
    await expect(
      submitPayoutOtp({ prisma, paystack }, officer, run.id, w.id, '111111'),
    ).rejects.toMatchObject({ code: 'OTP_REJECTED' });
    await expect(
      submitPayoutOtp({ prisma, paystack }, officer, run.id, w.id, '246810'),
    ).resolves.toEqual({ status: 'success' });

    const app = createApp({ paystack, paystackSecret: SECRET });
    const payload = JSON.stringify({
      event: 'transfer.success',
      data: { reference: w.paystackTransferRef, amount: balance, currency: 'NGN' },
    });
    const res = await request(app)
      .post('/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', createHmac('sha512', SECRET).update(payload).digest('hex'))
      .send(payload);
    expect(res.status).toBe(200);
    const settled = await prisma.withdrawal.findUniqueOrThrow({ where: { id: w.id } });
    expect(settled.status).toBe('PAID');
    let notified = 0;
    for (let i = 0; i < 20 && !notified; i++) {
      notified = await prisma.notification.count({
        where: { userId: s.usherUserId, type: 'PAYOUT_SENT' },
      });
      if (!notified) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(notified).toBe(1);
  });
});

describe('HTTP', () => {
  it('runs build, submit and approve through the admin API', async () => {
    await fundedUsher(2_000_000);
    const paystack = new InMemoryPaystack();
    const app = createApp({ paystack, paystackSecret: SECRET });
    const [maker, checker] = [await admin(), await admin()];
    const asMaker = `Bearer ${await signAccessToken(maker, 'ADMIN')}`;
    const asChecker = `Bearer ${await signAccessToken(checker, 'ADMIN')}`;

    const built = await request(app).post('/api/admin/payout-runs/build').set('Authorization', asMaker);
    expect(built.status).toBe(201);
    runIds.push(built.body.id);
    expect(built.body.status).toBe('DRAFT');
    const submitted = await request(app)
      .post(`/api/admin/payout-runs/${built.body.id}/submit`)
      .set('Authorization', asMaker)
      .send({ linesHash: built.body.linesHash });
    expect(submitted.body.status).toBe('AWAITING_APPROVAL');
    const own = await request(app)
      .post(`/api/admin/payout-runs/${built.body.id}/approve`)
      .set('Authorization', asMaker)
      .send({ linesHash: built.body.linesHash });
    expect(own.status).toBe(403);
    const approved = await request(app)
      .post(`/api/admin/payout-runs/${built.body.id}/approve`)
      .set('Authorization', asChecker)
      .send({ linesHash: built.body.linesHash });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('EXECUTED');
    expect(approved.body.lines.every((l: { withdrawal: unknown }) => l.withdrawal)).toBe(true);
    // Let the background dispatch finish before teardown.
    await dispatchPayoutRun({ prisma, paystack }, built.body.id);
  });

  it('refuses usher withdrawals in weekly mode and reports the next payout', async () => {
    const { s, bankId } = await fundedUsher(2_000_000);
    env.PAYOUT_MODE = 'weekly';
    const app = createApp({ paystack: new InMemoryPaystack(), paystackSecret: SECRET });
    const auth = `Bearer ${await signAccessToken(s.usherUserId, 'USHER')}`;
    const refused = await request(app)
      .post('/api/payments/withdrawals')
      .set('Authorization', auth)
      .set('Idempotency-Key', randomUUID())
      .send({ bankAccountId: bankId, amountKobo: 100_000 });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('PAYOUTS_SCHEDULED');
    const wallet = await request(app).get('/api/payments/wallet').set('Authorization', auth);
    expect(wallet.body).toMatchObject({
      payoutMode: 'weekly',
      payoutAccount: { id: bankId, last4: '6789' },
    });
    expect(new Date(wallet.body.nextPayoutAt).getUTCDay()).toBe(4);
  });
});
