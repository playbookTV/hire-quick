/** Local provider transport integration; this is NOT Paystack TEST certification. */
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { prisma } from '../../packages/database/src/index.js';
import {
  InMemoryPaystack,
  type PaystackPort,
} from '../../apps/api/src/modules/payments/port/paystack-port.js';
import { HttpPaystack } from '../../apps/api/src/modules/payments/port/http-paystack.js';
import { holdOrder, releaseBooking } from '../../apps/api/src/modules/payments/ledger/ledger.js';
import { idempotencyStorageKey } from '../../apps/api/src/modules/payments/ledger/idempotency.js';
import { reconcile } from '../../apps/api/src/modules/payments/ledger/reconciliation.js';
import {
  initChargeForOrder,
  initWithdrawal,
  refundBookingToClient,
  runCommissionSweep,
} from '../../apps/api/src/modules/payments/service.js';
import {
  createScenario,
  teardown,
  bookingLedgerSum,
  type Scenario,
} from '../../apps/api/src/modules/payments/__tests__/fixtures.js';

let scenario: Scenario | undefined;
let server: Server | undefined;
let sweepPeriod: string | undefined;
let idempotencyKey: string | undefined;
afterEach(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server!.close((error) => (error ? reject(error) : resolve())),
    );
  server = undefined;
  if (sweepPeriod) {
    await prisma.paymentOperation.deleteMany({
      where: { dedupeKey: `COMMISSION_SWEEP:${sweepPeriod}` },
    });
    // This suite owns the disposable schema; global sweep rows have no booking FK.
    await prisma.escrowLedger.deleteMany({ where: { entryType: 'COMMISSION_SWEEP' } });
  }
  if (idempotencyKey && scenario)
    await prisma.idempotencyKey.deleteMany({
      where: { key: idempotencyStorageKey(idempotencyKey, 'withdrawal', scenario.usherId) },
    });
  if (scenario) await teardown(scenario);
  scenario = undefined;
  sweepPeriod = undefined;
  idempotencyKey = undefined;
});

async function httpProvider(): Promise<{
  port: PaystackPort;
  credit: (amount: number) => void;
  requests: string[];
}> {
  let balance = 0;
  let chargeAmount = 0;
  const transfers = new Map<
    string,
    { status: string; reference: string; amount: number; currency: string }
  >();
  const refunds: { merchant_note: string; amount: number; currency: string; status: string }[] = [];
  const requests: string[] = [];
  server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    requests.push(`${req.method} ${url.pathname}`);
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    let data: unknown;
    let status = true;
    if (url.pathname === '/transaction/initialize') {
      chargeAmount = body.amount;
      data = {
        authorization_url: `https://checkout.test/${body.reference}`,
        reference: body.reference,
      };
    } else if (url.pathname.startsWith('/transaction/verify/')) {
      data = {
        id: 1,
        status: 'success',
        reference: decodeURIComponent(url.pathname.split('/').at(-1)!),
        amount: chargeAmount,
        currency: 'NGN',
      };
    } else if (url.pathname.startsWith('/transfer/verify/')) {
      const found = transfers.get(decodeURIComponent(url.pathname.split('/').at(-1)!));
      if (found) data = found;
      else {
        res.statusCode = 404;
        status = false;
        data = null;
      }
    } else if (url.pathname === '/transfer' && req.method === 'POST') {
      if (!transfers.has(body.reference)) {
        if (body.amount > balance) throw new Error('Local provider balance exhausted');
        balance -= body.amount;
        transfers.set(body.reference, {
          status: 'success',
          reference: body.reference,
          amount: body.amount,
          currency: 'NGN',
        });
      }
      data = transfers.get(body.reference);
    } else if (url.pathname === '/refund' && req.method === 'GET') data = refunds;
    else if (url.pathname === '/refund' && req.method === 'POST') {
      balance -= body.amount;
      data = { ...body, status: 'processed' };
      refunds.push(data as (typeof refunds)[number]);
    } else if (url.pathname === '/balance') data = [{ currency: 'NGN', balance }];
    else {
      res.statusCode = 500;
      status = false;
      data = null;
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status, data }));
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing local provider address');
  const base = `http://127.0.0.1:${address.port}`;
  const localFetch: typeof fetch = (input, init) => {
    const requested = new URL(String(input));
    return fetch(`${base}${requested.pathname}${requested.search}`, init);
  };
  return {
    port: new HttpPaystack('sk_test_local_transport_only', localFetch),
    credit: (amount) => {
      balance += amount;
    },
    requests,
  };
}

describe.each(['InMemoryPaystack', 'HttpPaystack loopback transport'])(
  '%s full service lifecycle',
  (implementation) => {
    it('conserves charge, refunds, payouts and fees with replay-safe final zero balance', async () => {
      const expectedSchema = new URL(process.env.DATABASE_URL!).searchParams.get('schema');
      const [isolation] = await prisma.$queryRaw<
        { schema: string }[]
      >`SELECT current_schema() AS schema`;
      expect(expectedSchema).toMatch(/^hq_validation_/);
      expect(isolation?.schema).toBe(expectedSchema);
      const fake = new InMemoryPaystack();
      const provider =
        implementation === 'InMemoryPaystack'
          ? {
              port: fake,
              credit: (amount: number) => fake.creditBalance(amount),
              requests: [] as string[],
            }
          : await httpProvider();
      const deps = { prisma, paystack: provider.port };
      scenario = await createScenario({ headcount: 2, amountKobo: 2_000_000 });
      const charge = await initChargeForOrder(deps, {
        orderId: scenario.orderId,
        email: 'validation@example.invalid',
        clientUserId: scenario.clientUserId,
      });
      const verified = await provider.port.verifyChargeKobo(charge.reference);
      expect(verified).toEqual({ status: 'success', amountKobo: 4_000_000 });
      provider.credit(verified.amountKobo);
      await prisma.$transaction((tx) => holdOrder(tx, scenario!.orderId, charge.reference));
      const [paidBooking, refundedBooking] = scenario.bookingIds;
      await prisma.booking.update({ where: { id: paidBooking! }, data: { status: 'CHECKED_IN' } });
      await prisma.$transaction((tx) => releaseBooking(tx, paidBooking!, 'OTP'));
      const refundParams = {
        bookingId: refundedBooking!,
        amountKobo: 2_000_000,
        precursor: 'CANCEL' as const,
      };
      expect(await refundBookingToClient(deps, refundParams)).toMatchObject({ status: 'RECORDED' });
      expect(await refundBookingToClient(deps, refundParams)).toMatchObject({ status: 'RECORDED' });
      const bank = await prisma.bankAccount.create({
        data: {
          usherId: scenario.usherId,
          bankCode: '058',
          accountNumber: '0000000000',
          accountName: 'Validation',
          verified: true,
          paystackRecipientCode: 'RCP_validation',
        },
      });
      idempotencyKey = randomUUID();
      const withdrawal = {
        idempotencyKey,
        usherId: scenario.usherId,
        walletId: scenario.walletId,
        bankAccountId: bank.id,
        amountKobo: 1_700_000,
      };
      await initWithdrawal(deps, withdrawal);
      await initWithdrawal(deps, withdrawal);
      sweepPeriod = `validation-${randomUUID()}`;
      expect(
        await runCommissionSweep(deps, {
          operatingRecipientCode: 'RCP_validation_ops',
          period: sweepPeriod,
        }),
      ).toEqual({ swept: 300_000 });
      await runCommissionSweep(deps, {
        operatingRecipientCode: 'RCP_validation_ops',
        period: sweepPeriod,
      });
      expect(await bookingLedgerSum(paidBooking!)).toBe(0);
      expect(await bookingLedgerSum(refundedBooking!)).toBe(0);
      expect(
        (await prisma.wallet.findUniqueOrThrow({ where: { id: scenario.walletId } }))
          .availableBalance,
      ).toBe(0);
      expect(await reconcile(prisma, provider.port)).toMatchObject({
        expectedKobo: 0,
        actualKobo: 0,
        driftKobo: 0,
        ok: true,
      });
      if (implementation.startsWith('HttpPaystack')) {
        expect(provider.requests.filter((r) => r === 'POST /refund')).toHaveLength(1);
        expect(provider.requests.filter((r) => r === 'POST /transfer')).toHaveLength(2);
      }
    });
  },
);
