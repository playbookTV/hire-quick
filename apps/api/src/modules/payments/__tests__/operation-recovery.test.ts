import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma, type Prisma } from '@hq/database';
import { claimOperation, runOperation } from '../ledger/operations.js';
import { idempotencyStorageKey } from '../ledger/idempotency.js';
import {
  holdOrder,
  markCheckedIn,
  releaseBooking,
  requestWithdrawal,
  freezeBooking,
  commissionSweep,
} from '../ledger/ledger.js';
import {
  driveTransfer,
  initWithdrawal,
  refundBookingToClient,
  runCommissionSweep,
} from '../service.js';
import { reconcileStuckWithdrawals, resumePaymentOperation } from '../recovery.js';
import { InMemoryPaystack, type PaystackPort } from '../port/paystack-port.js';
import { createScenario, teardown, type Scenario } from './fixtures.js';
import { decideApproval, executeApprovalOp, resolveDispute } from '../../admin/service.js';

let scenario: Scenario | undefined;
const operationIds: string[] = [];
const adminIds: string[] = [];
const keys: string[] = [];
let sweepStart: Date | undefined;

beforeAll(async () => {
  // A schema URL can qualify ORM queries without routing raw SQL there. Check
  // every validation connection before these tests create temporary triggers.
  const expected = new URL(process.env.DATABASE_URL!).searchParams.get('schema') ?? 'public';
  await Promise.all(
    Array.from({ length: 8 }, () =>
      prisma.$transaction(async (tx) => {
        const [row] = await tx.$queryRaw<{ schema: string }[]>`SELECT current_schema() AS schema`;
        expect(row?.schema, 'Raw SQL must use the ORM schema; set the connection search_path').toBe(
          expected,
        );
      }),
    ),
  );
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (adminIds.length) {
    const approvals = await prisma.approval.findMany({ where: { makerId: { in: adminIds } } });
    await prisma.paymentOperation.deleteMany({
      where: { dedupeKey: { in: approvals.map((a) => `APPROVAL_EXECUTE:${a.id}`) } },
    });
    await prisma.approval.deleteMany({ where: { makerId: { in: adminIds } } });
  }
  if (scenario) {
    await prisma.dispute.deleteMany({ where: { bookingId: { in: scenario.bookingIds } } });
    await teardown(scenario);
  }
  await prisma.paymentOperation.deleteMany({ where: { id: { in: operationIds } } });
  await prisma.idempotencyKey.deleteMany({ where: { key: { in: keys } } });
  if (sweepStart)
    await prisma.escrowLedger.deleteMany({
      where: { bookingId: null, createdAt: { gte: sweepStart } },
    });
  await prisma.user.deleteMany({ where: { id: { in: adminIds } } });
  scenario = undefined;
  operationIds.length = 0;
  adminIds.length = 0;
  keys.length = 0;
  sweepStart = undefined;
});

async function held() {
  scenario = await createScenario({ headcount: 1, amountKobo: 1_000_000 });
  await prisma.$transaction((tx) => holdOrder(tx, scenario!.orderId, `hq_${scenario!.orderId}`));
  return scenario;
}
async function wallet() {
  const s = await held();
  await prisma.$transaction(async (tx) => {
    await markCheckedIn(tx, s.bookingIds[0]!, 'AUTO');
    await releaseBooking(tx, s.bookingIds[0]!, 'AUTO');
  });
  const bank = await prisma.bankAccount.create({
    data: {
      usherId: s.usherId,
      verified: true,
      bankCode: '058',
      accountNumber: '0000000000',
      accountName: 'Test',
      paystackRecipientCode: 'rcp_test',
    },
  });
  return { s, bank };
}
async function operation() {
  const { op } = await claimOperation(prisma, {
    kind: 'COMMISSION_SWEEP',
    dedupeKey: `test:${randomUUID()}`,
    payload: {},
  });
  operationIds.push(op.id);
  return op;
}

// Real PostgreSQL transactions; CI supplies an isolated database.
describe('durable operation checkpoints', () => {
  it('keeps PROVIDER_OK after recording rolls back and records once across concurrent recovery', async () => {
    const op = await operation();
    sweepStart = new Date();
    const provider = vi.fn(async () => ({ status: 'success' as const }));
    const reconcile = vi.fn(async () => ({ status: 'unknown' as const }));
    await expect(
      runOperation(prisma, op, {
        provider,
        reconcile,
        onSuccess: async (tx) => {
          await commissionSweep(tx, 100);
          throw new Error('crash before commit');
        },
      }),
    ).rejects.toThrow('crash before commit');
    expect((await prisma.paymentOperation.findUniqueOrThrow({ where: { id: op.id } })).status).toBe(
      'PROVIDER_OK',
    );
    const onSuccess = vi.fn(async (tx: Prisma.TransactionClient) => {
      await commissionSweep(tx, 100);
      return true;
    });
    await Promise.all([
      runOperation(prisma, op, { provider, reconcile, onSuccess }),
      runOperation(prisma, op, { provider, reconcile, onSuccess }),
    ]);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(reconcile).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(
      await prisma.escrowLedger.count({
        where: { bookingId: null, createdAt: { gte: sweepStart } },
      }),
    ).toBe(1);
  });
});

describe('refund reservation and recovery', () => {
  it('allows only one financial outcome when refund races attendance and release', async () => {
    const s = await held();
    const bookingId = s.bookingIds[0]!;
    const paystack = new InMemoryPaystack();
    const refund = vi.spyOn(paystack, 'refund');
    const results = await Promise.allSettled([
      refundBookingToClient(
        { prisma, paystack },
        { bookingId, amountKobo: s.amountKobo, precursor: 'CANCEL' },
      ),
      prisma.$transaction(async (tx) => {
        await markCheckedIn(tx, bookingId, 'AUTO');
        await releaseBooking(tx, bookingId, 'AUTO');
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(['PAID', 'REFUNDED']).toContain(booking.status);
    expect(refund).toHaveBeenCalledTimes(booking.status === 'REFUNDED' ? 1 : 0);
    expect(
      await prisma.escrowLedger.count({
        where: { bookingId, entryType: { in: ['RELEASE', 'REFUND'] } },
      }),
    ).toBe(1);
  });
  it('rejects released escrow before any provider call', async () => {
    const { s } = await wallet();
    const paystack = new InMemoryPaystack();
    const refund = vi.spyOn(paystack, 'refund');
    await expect(
      refundBookingToClient(
        { prisma, paystack },
        { bookingId: s.bookingIds[0]!, amountKobo: s.amountKobo },
      ),
    ).rejects.toThrow(/refundable/);
    expect(refund).not.toHaveBeenCalled();
  });
  it('rejects wrong amounts and illegal predecessors before any provider call', async () => {
    const s = await held();
    const paystack = new InMemoryPaystack();
    const refund = vi.spyOn(paystack, 'refund');
    await expect(
      refundBookingToClient(
        { prisma, paystack },
        { bookingId: s.bookingIds[0]!, amountKobo: 1, precursor: 'CANCEL' },
      ),
    ).rejects.toThrow(/held/);
    await expect(
      refundBookingToClient(
        { prisma, paystack },
        { bookingId: s.bookingIds[0]!, amountKobo: s.amountKobo },
      ),
    ).rejects.toThrow(/Illegal/);
    expect(refund).not.toHaveBeenCalled();
  });
  it('blocks attendance/release during a pending refund and reconciles without another POST', async () => {
    const s = await held();
    const paystack: PaystackPort = new InMemoryPaystack();
    const refund = vi.spyOn(paystack, 'refund').mockResolvedValue({ status: 'pending' });
    const params = {
      bookingId: s.bookingIds[0]!,
      amountKobo: s.amountKobo,
      precursor: 'CANCEL' as const,
    };
    expect((await refundBookingToClient({ prisma, paystack }, params)).status).toBe('PENDING');
    await expect(
      prisma.$transaction((tx) => markCheckedIn(tx, params.bookingId, 'AUTO')),
    ).rejects.toThrow(/reserved/);
    await expect(
      prisma.$transaction((tx) => releaseBooking(tx, params.bookingId, 'AUTO')),
    ).rejects.toThrow(/reserved/);
    vi.spyOn(paystack, 'verifyRefund').mockResolvedValue({ status: 'processed' });
    expect((await refundBookingToClient({ prisma, paystack }, params)).status).toBe('RECORDED');
    expect(refund).toHaveBeenCalledTimes(1);
    expect(
      (await prisma.booking.findUniqueOrThrow({ where: { id: params.bookingId } })).status,
    ).toBe('REFUNDED');
  });
  it('reconciles a lost refund response from read-only evidence', async () => {
    const s = await held();
    const paystack = new InMemoryPaystack();
    const original = paystack.refund.bind(paystack);
    const refund = vi.spyOn(paystack, 'refund').mockImplementation(async (p) => {
      await original(p);
      throw new Error('response lost');
    });
    const params = {
      bookingId: s.bookingIds[0]!,
      amountKobo: s.amountKobo,
      precursor: 'CANCEL' as const,
    };
    expect((await refundBookingToClient({ prisma, paystack }, params)).status).toBe('PENDING');
    const op = await prisma.paymentOperation.findUniqueOrThrow({
      where: { dedupeKey: `BOOKING_REFUND:${params.bookingId}` },
    });
    expect(await resumePaymentOperation({ prisma, paystack }, op)).toBe('recorded');
    expect(refund).toHaveBeenCalledTimes(1);
  });
  it('settles a pending dispute refund and its resolution in the same transaction on recovery', async () => {
    const s = await held();
    const bookingId = s.bookingIds[0]!;
    await prisma.$transaction((tx) => freezeBooking(tx, bookingId));
    const dispute = await prisma.dispute.create({
      data: { bookingId, raisedById: s.clientUserId, reason: 'test' },
    });
    const admin = await prisma.user.create({
      data: { role: 'ADMIN', phone: randomUUID(), status: 'ACTIVE' },
    });
    adminIds.push(admin.id);
    const paystack: PaystackPort = new InMemoryPaystack();
    vi.spyOn(paystack, 'refund').mockResolvedValue({ status: 'pending' });
    await refundBookingToClient(
      { prisma, paystack },
      {
        bookingId,
        amountKobo: s.amountKobo,
        disputeResolution: {
          disputeId: dispute.id,
          resolution: 'refund agreed',
          adminId: admin.id,
        },
      },
    );
    expect((await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })).status).toBe(
      'OPEN',
    );
    vi.spyOn(paystack, 'verifyRefund').mockResolvedValue({ status: 'processed' });
    const op = await prisma.paymentOperation.findUniqueOrThrow({
      where: { dedupeKey: `BOOKING_REFUND:${bookingId}` },
    });
    await resumePaymentOperation({ prisma, paystack }, op);
    expect((await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })).status).toBe(
      'RESOLVED',
    );
  });
});

describe('withdrawal and commission recovery', () => {
  it('keeps funds debited on uncertainty and accepts a later success without a reversal', async () => {
    const { s, bank } = await wallet();
    const paystack: PaystackPort = new InMemoryPaystack();
    vi.spyOn(paystack, 'transfer').mockResolvedValue({ status: 'unknown', reference: 'unused' });
    const key = randomUUID();
    keys.push(idempotencyStorageKey(key, 'withdrawal', s.usherId));
    const result = await initWithdrawal(
      { prisma, paystack },
      {
        idempotencyKey: key,
        usherId: s.usherId,
        walletId: s.walletId,
        bankAccountId: bank.id,
        amountKobo: 500_000,
      },
    );
    const op = await prisma.paymentOperation.findUniqueOrThrow({
      where: { dedupeKey: `WITHDRAWAL_TRANSFER:${result.withdrawalId}` },
    });
    expect(op.status).toBe('PENDING');
    expect(
      (await prisma.wallet.findUniqueOrThrow({ where: { id: s.walletId } })).availableBalance,
    ).toBe(350_000);
    vi.spyOn(paystack, 'verifyTransfer').mockResolvedValue({ status: 'success' });
    await resumePaymentOperation({ prisma, paystack }, op);
    expect(
      (await prisma.withdrawal.findUniqueOrThrow({ where: { id: result.withdrawalId } })).status,
    ).toBe('PAID');
    expect(
      await prisma.walletLedger.count({
        where: { withdrawalId: result.withdrawalId, entryType: 'REVERSAL' },
      }),
    ).toBe(0);
  });
  it('rolls back the debit when its recovery intent cannot commit', async () => {
    const { s, bank } = await wallet();
    const key = randomUUID();
    keys.push(idempotencyStorageKey(key, 'withdrawal', s.usherId));
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION test_reject_operation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'intent storage failed'; END $$`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER test_reject_operation BEFORE INSERT ON payment_operations FOR EACH ROW EXECUTE FUNCTION test_reject_operation()`,
    );
    try {
      await expect(
        initWithdrawal(
          { prisma, paystack: new InMemoryPaystack() },
          {
            idempotencyKey: key,
            usherId: s.usherId,
            walletId: s.walletId,
            bankAccountId: bank.id,
            amountKobo: 500_000,
          },
        ),
      ).rejects.toThrow(/intent storage failed/);
      expect(
        (await prisma.wallet.findUniqueOrThrow({ where: { id: s.walletId } })).availableBalance,
      ).toBe(850_000);
      expect(await prisma.withdrawal.count({ where: { walletId: s.walletId } })).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER test_reject_operation ON payment_operations');
      await prisma.$executeRawUnsafe('DROP FUNCTION test_reject_operation()');
    }
  });
  it('reconstructs a legacy orphan withdrawal using its stored amount and bank', async () => {
    const { s, bank } = await wallet();
    const paystack = new InMemoryPaystack();
    const id = await prisma.$transaction((tx) =>
      requestWithdrawal(tx, s.walletId, bank.id, 500_000),
    );
    await prisma.withdrawal.update({ where: { id }, data: { updatedAt: new Date(0) } });
    expect((await reconcileStuckWithdrawals({ prisma, paystack })).completed).toBe(1);
    expect((await prisma.withdrawal.findUniqueOrThrow({ where: { id } })).status).toBe('PAID');
    expect(
      await prisma.paymentOperation.count({ where: { dedupeKey: `WITHDRAWAL_TRANSFER:${id}` } }),
    ).toBe(1);
  });
  it('settles an old RECORDED intent whose withdrawal is still PROCESSING without sending again', async () => {
    const { s, bank } = await wallet();
    const paystack = new InMemoryPaystack();
    const id = await prisma.$transaction((tx) =>
      requestWithdrawal(tx, s.walletId, bank.id, 500_000),
    );
    await prisma.paymentOperation.create({
      data: {
        kind: 'WITHDRAWAL_TRANSFER',
        dedupeKey: `WITHDRAWAL_TRANSFER:${id}`,
        status: 'RECORDED',
        payload: {
          withdrawalId: id,
          amountKobo: 500_000,
          recipientCode: 'rcp_test',
          reference: `wd_${id}`,
        },
      },
    });
    await prisma.withdrawal.update({ where: { id }, data: { updatedAt: new Date(0) } });
    vi.spyOn(paystack, 'verifyTransfer').mockResolvedValue({ status: 'success' });
    const transfer = vi.spyOn(paystack, 'transfer');
    expect((await reconcileStuckWithdrawals({ prisma, paystack })).completed).toBe(1);
    expect(transfer).not.toHaveBeenCalled();
    expect((await prisma.withdrawal.findUniqueOrThrow({ where: { id } })).status).toBe('PAID');
  });
  it('does not sweep a pending transfer again in a later period', async () => {
    await wallet();
    sweepStart = new Date();
    const paystack: PaystackPort = new InMemoryPaystack();
    vi.spyOn(paystack, 'transfer').mockResolvedValue({ status: 'pending', reference: 'unused' });
    const period = randomUUID();
    await runCommissionSweep({ prisma, paystack }, { operatingRecipientCode: 'rcp', period });
    const op = await prisma.paymentOperation.findUniqueOrThrow({
      where: { dedupeKey: `COMMISSION_SWEEP:${period}` },
    });
    operationIds.push(op.id);
    expect(
      await runCommissionSweep(
        { prisma, paystack },
        { operatingRecipientCode: 'rcp', period: `${period}-later` },
      ),
    ).toEqual({ swept: 0 });
    vi.spyOn(paystack, 'verifyTransfer').mockResolvedValue({ status: 'success' });
    await Promise.all([
      driveTransfer({ prisma, paystack }, op),
      driveTransfer({ prisma, paystack }, op),
    ]);
    expect(
      await prisma.escrowLedger.count({
        where: { bookingId: null, createdAt: { gte: sweepStart } },
      }),
    ).toBe(1);
  });
});

describe('approval recovery', () => {
  it('rolls dispute release back with resolution and repairs an old split commit without paying twice', async () => {
    const s = await held();
    const bookingId = s.bookingIds[0]!;
    await prisma.$transaction((tx) => freezeBooking(tx, bookingId));
    const dispute = await prisma.dispute.create({
      data: { bookingId, raisedById: s.clientUserId, reason: 'test' },
    });
    const admin = await prisma.user.create({
      data: { role: 'ADMIN', phone: randomUUID(), status: 'ACTIVE' },
    });
    adminIds.push(admin.id);
    const paystack = new InMemoryPaystack();
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION test_reject_resolution() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'resolution storage failed'; END $$`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER test_reject_resolution BEFORE UPDATE ON disputes FOR EACH ROW EXECUTE FUNCTION test_reject_resolution()`,
    );
    try {
      await expect(
        resolveDispute(admin.id, dispute.id, 'RELEASE', 'attendance confirmed', paystack),
      ).rejects.toThrow(/resolution storage failed/);
      expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe(
        'DISPUTED',
      );
      expect(
        (await prisma.wallet.findUniqueOrThrow({ where: { id: s.walletId } })).availableBalance,
      ).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER test_reject_resolution ON disputes');
      await prisma.$executeRawUnsafe('DROP FUNCTION test_reject_resolution()');
    }
    await resolveDispute(admin.id, dispute.id, 'RELEASE', 'attendance confirmed', paystack);
    // Recreate the old partial commit: payout exists while the dispute is open.
    await prisma.dispute.update({
      where: { id: dispute.id },
      data: { status: 'OPEN', resolvedById: null, resolution: null },
    });
    await resolveDispute(admin.id, dispute.id, 'RELEASE', 'attendance confirmed', paystack);
    expect(await prisma.escrowLedger.count({ where: { bookingId, entryType: 'RELEASE' } })).toBe(1);
    expect((await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })).status).toBe(
      'RESOLVED',
    );
  });
  it('rolls back the checker decision when recovery intent creation fails', async () => {
    for (let i = 0; i < 2; i++)
      adminIds.push(
        (
          await prisma.user.create({
            data: { role: 'ADMIN', phone: randomUUID(), status: 'ACTIVE' },
          })
        ).id,
      );
    const approval = await prisma.approval.create({
      data: { kind: 'REFUND', makerId: adminIds[0]!, amountKobo: 100, payload: {} },
    });
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION test_reject_operation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'intent storage failed'; END $$`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER test_reject_operation BEFORE INSERT ON payment_operations FOR EACH ROW EXECUTE FUNCTION test_reject_operation()`,
    );
    try {
      await expect(
        decideApproval(adminIds[1]!, approval.id, 'approve', new InMemoryPaystack()),
      ).rejects.toThrow(/intent storage failed/);
      const stored = await prisma.approval.findUniqueOrThrow({ where: { id: approval.id } });
      expect(stored.status).toBe('PENDING');
      expect(stored.checkerId).toBeNull();
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER test_reject_operation ON payment_operations');
      await prisma.$executeRawUnsafe('DROP FUNCTION test_reject_operation()');
    }
  });
  it('recovers a legacy dispute refund whose ledger committed before dispute resolution', async () => {
    const s = await held();
    const bookingId = s.bookingIds[0]!;
    await prisma.$transaction((tx) => freezeBooking(tx, bookingId));
    const dispute = await prisma.dispute.create({
      data: { bookingId, raisedById: s.clientUserId, reason: 'test' },
    });
    const admin = await prisma.user.create({
      data: { role: 'ADMIN', phone: randomUUID(), status: 'ACTIVE' },
    });
    adminIds.push(admin.id);
    const paystack = new InMemoryPaystack();
    await refundBookingToClient({ prisma, paystack }, { bookingId, amountKobo: s.amountKobo });
    const refund = vi.spyOn(paystack, 'refund');
    expect(
      (await resolveDispute(admin.id, dispute.id, 'REFUND', 'refund agreed', paystack)).executed,
    ).toBe(true);
    expect(refund).not.toHaveBeenCalled();
    expect((await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })).status).toBe(
      'RESOLVED',
    );
  });
  it('persists the checker and intent before an uncertain refund, then marks EXECUTED only after settlement', async () => {
    const s = await held();
    for (let i = 0; i < 2; i++)
      adminIds.push(
        (
          await prisma.user.create({
            data: { role: 'ADMIN', phone: randomUUID(), status: 'ACTIVE' },
          })
        ).id,
      );
    const approval = await prisma.approval.create({
      data: {
        kind: 'REFUND',
        makerId: adminIds[0]!,
        amountKobo: s.amountKobo,
        payload: { bookingId: s.bookingIds[0], amountKobo: s.amountKobo },
      },
    });
    const paystack: PaystackPort = new InMemoryPaystack();
    vi.spyOn(paystack, 'refund').mockResolvedValue({ status: 'pending' });
    await decideApproval(adminIds[1]!, approval.id, 'approve', paystack);
    expect((await prisma.approval.findUniqueOrThrow({ where: { id: approval.id } })).status).toBe(
      'APPROVED',
    );
    expect(
      await prisma.paymentOperation.count({
        where: { dedupeKey: `APPROVAL_EXECUTE:${approval.id}` },
      }),
    ).toBe(1);
    vi.spyOn(paystack, 'verifyRefund').mockResolvedValue({ status: 'processed' });
    await executeApprovalOp(approval, paystack);
    expect((await prisma.approval.findUniqueOrThrow({ where: { id: approval.id } })).status).toBe(
      'EXECUTED',
    );
  });
  it('rejects direct execution of an approval without a checker', async () => {
    const admin = await prisma.user.create({
      data: { role: 'ADMIN', phone: randomUUID(), status: 'ACTIVE' },
    });
    adminIds.push(admin.id);
    const approval = await prisma.approval.create({
      data: { kind: 'REFUND', makerId: admin.id, amountKobo: 100, payload: {} },
    });
    await expect(executeApprovalOp(approval, new InMemoryPaystack())).rejects.toThrow(/checker/);
    expect(
      await prisma.paymentOperation.count({
        where: { dedupeKey: `APPROVAL_EXECUTE:${approval.id}` },
      }),
    ).toBe(0);
  });
});
