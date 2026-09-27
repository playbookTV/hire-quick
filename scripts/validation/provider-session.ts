/** Resumable actual Paystack TEST evidence. Never imported by automatic test discovery. */
import { strict as assert } from 'node:assert';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Scenario } from '../../apps/api/src/modules/payments/__tests__/fixtures.js';
import type { PrismaClient } from '../../packages/database/src/index.js';
import { reserveProviderPost, type ProviderPostPlan } from './provider-session-guard.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const requireApi = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const configured = { ...requireApi('dotenv').parse(readFileSync(`${root}/.env`)), ...process.env };
const secret = String(configured.PAYSTACK_SECRET_KEY ?? '');
assert.ok(/^sk_test_[A-Za-z0-9]+$/.test(secret), 'Only a Paystack TEST key is permitted');
const action = process.argv[2];
assert.ok(
  ['start', 'charge', 'refund', 'withdraw', 'sweep', 'inspect', 'cleanup'].includes(action ?? ''),
);
assert.ok(process.argv[3], 'A private session JSON path is required');
const statePath = resolve(process.argv[3]!);
assert.ok(!statePath.startsWith(root), 'Keep private session state outside the repository');
mkdirSync(dirname(statePath), { recursive: true, mode: 0o700 });
const lockPath = `${statePath}.lock`;
const lock = openSync(lockPath, 'wx', 0o600);
const source = new URL(configured.DIRECT_URL ?? configured.DATABASE_URL);
assert.ok(['postgres:', 'postgresql:'].includes(source.protocol));
source.hostname = source.hostname.replace('-pooler.', '.');
source.searchParams.delete('pgbouncer');
source.searchParams.set('connection_limit', '4');
source.searchParams.set('connect_timeout', '20');
source.searchParams.set('pool_timeout', '60');
const account = createHash('sha256').update(secret).digest('hex');
const target = createHash('sha256')
  .update(`${source.hostname}/${source.pathname}/${source.username}`)
  .digest('hex');
type Observation = {
  method: string;
  path: string;
  httpStatus: number;
  rejectionCategory?: string;
  domain?: string;
  status?: string;
  amount?: number;
  fees?: number;
};
type State = {
  version: 1;
  schema: string;
  account: string;
  target: string;
  createdAt: string;
  recipient: string;
  scenario?: Scenario;
  bankId?: string;
  checkoutUrl?: string;
  reference?: string;
  withdrawalKey: string;
  sweepPeriod: string;
  openingBalanceKobo?: number;
  currentBalanceKobo?: number;
  posts: string[];
  observations: Observation[];
  databaseReady?: boolean;
  cleaned?: boolean;
  result?: Record<string, unknown>;
};
let state: State;
let control: PrismaClient | undefined;
let prisma: PrismaClient | undefined;
function save() {
  writeFileSync(`${statePath}.new`, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  renameSync(`${statePath}.new`, statePath);
}
const unit = 100_000; // Two simulated ₦1,000 bookings: refund ₦1,000, payout ₦850, fee ₦150.
try {
  if (action === 'start') {
    assert.ok(!existsSync(statePath), 'Session already exists; resume it instead');
    const recipient = configured.HQ_TEST_RECIPIENT;
    assert.match(recipient ?? '', /^RCP_[A-Za-z0-9]+$/, 'Select an existing TEST recipient');
    state = {
      version: 1,
      schema: `hq_validation_cert_${randomUUID().replaceAll('-', '')}`,
      account,
      target,
      createdAt: new Date().toISOString(),
      recipient,
      withdrawalKey: randomUUID(),
      sweepPeriod: `cert_${randomUUID().replaceAll('-', '')}`,
      posts: [],
      observations: [],
    };
    save();
  } else {
    state = JSON.parse(readFileSync(statePath, 'utf8')) as State;
    assert.equal(state.version, 1);
    assert.equal(state.account, account, 'Paystack account changed');
    assert.equal(state.target, target, 'Database target changed');
    assert.match(state.schema, /^hq_validation_cert_[a-f0-9]{32}$/);
    assert.ok(!state.cleaned, 'Session was already cleaned');
  }
  const url = new URL(source);
  url.searchParams.set('schema', state.schema);
  url.searchParams.set('options', `-c search_path=${state.schema}`);
  Object.assign(process.env, {
    DATABASE_URL: url.toString(),
    DIRECT_URL: url.toString(),
    NODE_ENV: 'test',
    PAYSTACK_SECRET_KEY: secret,
    PAYSTACK_WEBHOOK_SECRET: 'local-certification-only',
    OTP_VERIFIER_SECRET: 'isolated-certification-secret-never-deployed',
    OTP_VERIFIER_KEY_ID: 'cert',
    OTP_VERIFIER_PREVIOUS_KEY_ID: '',
    OTP_VERIFIER_PREVIOUS_SECRET: '',
    STAGING_QA_OTP_CODE: '',
    BREVO_API_KEY: '',
    REDIS_URL: '',
    SMILE_API_KEY: '',
    SMILE_PARTNER_ID: '',
    KYC_MODE: 'manual',
    TWILIO_ACCOUNT_SID: '',
    TWILIO_API_KEY_SID: '',
    TWILIO_API_KEY_SECRET: '',
    TWILIO_WHATSAPP_FROM: '',
    TWILIO_WHATSAPP_CONTENT_SID: '',
    FCM_PROJECT_ID: '',
    FCM_CLIENT_EMAIL: '',
    FCM_PRIVATE_KEY: '',
    STORAGE_BUCKET: '',
    STORAGE_ACCESS_KEY: '',
    STORAGE_SECRET_KEY: '',
    PAYSTACK_OPERATING_RECIPIENT: '',
    WITHDRAWAL_REQUIRE_BVN: 'false',
    LOG_LEVEL: 'silent',
  });
  const db = await import('../../packages/database/src/index.js');
  prisma = db.prisma;
  control = new db.PrismaClient({ datasources: { db: { url: source.toString() } } });
  const rawGet = async (path: string) => {
    const response = await fetch(`https://api.paystack.co${path}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(15_000),
    });
    assert.ok(response.ok, `Provider read failed (${response.status})`);
    const body = (await response.json()) as { status: boolean; data: Record<string, unknown> };
    assert.equal(body.status, true);
    return body.data;
  };
  // Confirm the selected beneficiary belongs to TEST before any external POST.
  if (action !== 'cleanup') {
    const recipient = await rawGet(`/transferrecipient/${encodeURIComponent(state.recipient)}`);
    assert.equal(recipient.domain, 'test');
    assert.equal(recipient.active, true);
    assert.equal(recipient.currency, 'NGN');
  }
  if (action === 'start') {
    await control.$executeRawUnsafe(`CREATE SCHEMA "${state.schema}"`);
    const [isolation] = await prisma.$queryRaw<
      { schema: string }[]
    >`SELECT current_schema() AS schema`;
    assert.equal(isolation?.schema, state.schema);
    for (const args of [
      ['migrate', 'deploy'],
      [
        'migrate',
        'diff',
        '--from-url',
        url.toString(),
        '--to-schema-datamodel',
        'prisma/schema.prisma',
        '--exit-code',
      ],
    ]) {
      const result = spawnSync('pnpm', ['--filter', '@hq/database', 'exec', 'prisma', ...args], {
        cwd: root,
        env: process.env,
        encoding: 'utf8',
        timeout: 120_000,
      });
      // Prisma diagnostics can contain credentials. Keep only the command and status.
      assert.equal(result.status, 0, `Database ${args[0]} ${args[1]} failed; session retained`);
    }
    state.databaseReady = true;
    save();
  }
  const [isolation] = await prisma.$queryRaw<
    { schema: string }[]
  >`SELECT current_schema() AS schema`;
  assert.equal(isolation?.schema, state.schema, 'Refusing access outside the certification schema');
  assert.ok(state.databaseReady, 'Session setup incomplete; inspect before cleanup');
  if (
    action === 'cleanup' &&
    (await prisma.escrowLedger.count()) === 0 &&
    (await prisma.paymentOperation.count()) === 0
  ) {
    // A rejected initialization may be removed only after authoritative absence.
    assert.ok(state.reference);
    const response = await fetch(`https://api.paystack.co/transaction/verify/${state.reference}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await response.json()) as { status?: boolean; message?: string };
    assert.equal(response.status, 400);
    assert.equal(body.status, false);
    assert.equal(body.message, 'Transaction reference not found.');
    await prisma.$disconnect();
    await control.$executeRawUnsafe(`DROP SCHEMA "${state.schema}" CASCADE`);
    const remaining = await control.$queryRawUnsafe<unknown[]>(
      'SELECT 1 FROM pg_namespace WHERE nspname = $1',
      state.schema,
    );
    assert.equal(remaining.length, 0);
    state.cleaned = true;
    state.result = { rejectedInitialization: true, providerAbsenceVerified: true };
    save();
  }
  if (!state.cleaned) {
    const guardedFetch: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.origin, 'https://api.paystack.co');
      const method = init?.method ?? 'GET';
      assert.ok(method === 'GET' || method === 'POST');
      if (method === 'POST') {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        assert.equal(body.currency, 'NGN');
        let plan: ProviderPostPlan;
        if (url.pathname === '/transaction/initialize') {
          assert.equal(action, 'start');
          assert.equal(body.reference, state.reference);
          plan = { path: '/transaction/initialize', reference: state.reference!, amount: unit * 2 };
        } else if (url.pathname === '/refund') {
          assert.equal(action, 'refund');
          assert.equal(body.transaction, state.reference);
          assert.equal(body.amount, unit);
          assert.equal(body.merchant_note, `BOOKING_REFUND:${state.scenario!.bookingIds[1]}`);
          plan = {
            path: '/refund',
            reference: `BOOKING_REFUND:${state.scenario!.bookingIds[1]}`,
            chargeReference: state.reference!,
            amount: unit,
          };
        } else {
          assert.equal(url.pathname, '/transfer');
          assert.equal(body.recipient, state.recipient);
          assert.equal(body.source, 'balance');
          if (action === 'withdraw') {
            assert.equal(body.amount, 85_000);
            const withdrawal = await prisma!.withdrawal.findFirstOrThrow({
              where: { walletId: state.scenario!.walletId },
            });
            assert.equal(body.reference, `wd_${withdrawal.id}`);
            plan = {
              path: '/transfer',
              reference: `wd_${withdrawal.id}`,
              amount: 85_000,
              recipient: state.recipient,
            };
          } else {
            assert.equal(action, 'sweep');
            assert.equal(body.amount, 15_000);
            assert.equal(body.reference, `sweep_${state.sweepPeriod}`);
            plan = {
              path: '/transfer',
              reference: `sweep_${state.sweepPeriod}`,
              amount: 15_000,
              recipient: state.recipient,
            };
          }
        }
        const identity = reserveProviderPost(secret, url.toString(), body, plan, state.posts);
        state.posts.push(identity);
        save(); // Persist BEFORE dispatch, including response-loss cases.
      } else {
        assert.ok(
          url.pathname === '/balance' ||
            url.pathname === '/refund' ||
            url.pathname === `/transaction/verify/${state.reference}` ||
            url.pathname.startsWith('/transfer/verify/'),
          'Unexpected provider read',
        );
      }
      const response = await fetch(input, init);
      const body = (await response.clone().json()) as {
        status?: boolean;
        message?: string;
        data?: Record<string, unknown>;
      };
      const data = body.data;
      const row: Observation = {
        method,
        path: url.pathname.replace(/\/verify\/.+$/, '/verify/:reference'),
        httpStatus: response.status,
      };
      if (!response.ok)
        row.rejectionCategory =
          ['email', 'reference', 'amount', 'balance', 'permission'].find((word) =>
            body.message?.toLowerCase().includes(word),
          ) ?? 'other';
      if (response.ok && body.status && data && !Array.isArray(data)) {
        if (data.domain !== undefined) {
          assert.equal(data.domain, 'test');
          row.domain = 'test';
        }
        if (typeof data.status === 'string') row.status = data.status;
        if (typeof data.amount === 'number') row.amount = data.amount;
        if (typeof data.fees === 'number') row.fees = data.fees;
      }
      state.observations.push(row);
      save();
      return response;
    };
    const { HttpPaystack } =
      await import('../../apps/api/src/modules/payments/port/http-paystack.js');
    const paystack = new HttpPaystack(secret, guardedFetch);
    const deps = { prisma, paystack };
    const { createScenario, bookingLedgerSum } =
      await import('../../apps/api/src/modules/payments/__tests__/fixtures.js');
    const { initChargeForOrder, initWithdrawal, refundBookingToClient, runCommissionSweep } =
      await import('../../apps/api/src/modules/payments/service.js');
    const { recordCheckoutCharge } =
      await import('../../apps/api/src/modules/payments/checkout.js');
    const { markCheckedIn, releaseBooking } =
      await import('../../apps/api/src/modules/payments/ledger/ledger.js');
    const txOptions = { timeout: 30_000, maxWait: 30_000 };
    if (action === 'start') {
      state.openingBalanceKobo = await paystack.getBalanceKobo();
      state.scenario = await createScenario({ headcount: 2, amountKobo: unit });
      save();
      state.reference = `hq-${state.scenario.orderId}`;
      save();
      await prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: state.scenario!.orderId },
          data: { paystackChargeRef: state.reference! },
        });
        await tx.checkout.create({
          data: {
            orderId: state.scenario!.orderId,
            reference: state.reference!,
            email: 'certification@example.com',
            state: 'CREATED',
            expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
          },
        });
      }, txOptions);
      const charge = await initChargeForOrder(deps, {
        orderId: state.scenario.orderId,
        email: 'certification@example.com',
        clientUserId: state.scenario.clientUserId,
      });
      assert.equal(charge.state, 'READY');
      const checkout = await prisma.checkout.findUniqueOrThrow({
        where: { orderId: state.scenario.orderId },
      });
      assert.ok(checkout.authorizationUrl);
      state.checkoutUrl = checkout.authorizationUrl;
      save();
    } else if (action === 'charge') {
      const charge = await rawGet(`/transaction/verify/${state.reference}`);
      assert.equal(charge.domain, 'test');
      assert.equal(charge.status, 'success');
      assert.equal(charge.currency, 'NGN');
      assert.equal(charge.amount, unit * 2);
      assert.equal(charge.reference, state.reference);
      const verified = await paystack.verifyChargeKobo(state.reference!);
      assert.deepEqual(verified, { status: 'success', amountKobo: unit * 2 });
      await prisma.$transaction(
        (tx) => recordCheckoutCharge(tx, state.scenario!.orderId, state.reference!),
        txOptions,
      );
      await prisma.$transaction(
        (tx) => recordCheckoutCharge(tx, state.scenario!.orderId, state.reference!),
        txOptions,
      );
      const booking = await prisma.booking.findUniqueOrThrow({
        where: { id: state.scenario!.bookingIds[0]! },
      });
      if (booking.status === 'CONFIRMED')
        await prisma.$transaction((tx) => markCheckedIn(tx, booking.id, 'OTP'), txOptions);
      await prisma.$transaction((tx) => releaseBooking(tx, booking.id, 'OTP'), txOptions);
      assert.equal(await bookingLedgerSum(booking.id), 0);
    } else if (action === 'refund') {
      const request = {
        bookingId: state.scenario!.bookingIds[1]!,
        amountKobo: unit,
        precursor: 'CANCEL' as const,
      };
      await refundBookingToClient(deps, request);
      await refundBookingToClient(deps, request);
    } else if (action === 'withdraw') {
      if (!state.bankId) {
        const existing = await prisma.bankAccount.findFirst({
          where: { usherId: state.scenario!.usherId },
        });
        const bank =
          existing ??
          (await prisma.bankAccount.create({
            data: {
              usherId: state.scenario!.usherId,
              bankCode: '058',
              accountNumber: '0000000000',
              accountName: 'TEST fixture; beneficiary independently checked',
              verified: true,
              paystackRecipientCode: state.recipient,
            },
          }));
        state.bankId = bank.id;
        save();
      }
      const request = {
        idempotencyKey: state.withdrawalKey,
        usherId: state.scenario!.usherId,
        walletId: state.scenario!.walletId,
        bankAccountId: state.bankId!,
        amountKobo: 85_000,
      };
      const first = await initWithdrawal(deps, request);
      const replay = await initWithdrawal(deps, request);
      assert.equal(first.withdrawalId, replay.withdrawalId);
      assert.equal(replay.duplicate, true);
    } else if (action === 'sweep') {
      const request = { operatingRecipientCode: state.recipient, period: state.sweepPeriod };
      await runCommissionSweep(deps, request);
      await runCommissionSweep(deps, request);
    }
    if (state.scenario) {
      const wallet = await prisma.wallet.findUniqueOrThrow({
        where: { id: state.scenario.walletId },
      });
      const ledger = await prisma.walletLedger.aggregate({
        where: { walletId: wallet.id },
        _sum: { amount: true },
      });
      assert.equal(wallet.availableBalance, ledger._sum.amount ?? 0);
      const withdrawals = await prisma.withdrawal.findMany({
        where: { walletId: wallet.id },
        select: { id: true, status: true, amount: true, paystackTransferRef: true },
      });
      const operations = await prisma.paymentOperation.findMany({
        select: { kind: true, status: true, dedupeKey: true, attempts: true },
      });
      const entries = await prisma.escrowLedger.groupBy({
        by: ['entryType'],
        _sum: { amount: true },
        _count: true,
      });
      state.currentBalanceKobo = await paystack.getBalanceKobo();
      const expectedPrincipalKobo =
        entries.reduce(
          (sum, entry) =>
            sum +
            (['HOLD', 'REFUND', 'COMMISSION_SWEEP'].includes(entry.entryType)
              ? (entry._sum.amount ?? 0)
              : 0),
          0,
        ) - withdrawals.filter((w) => w.status === 'PAID').reduce((sum, w) => sum + w.amount, 0);
      const observedBalanceDeltaKobo = state.currentBalanceKobo - state.openingBalanceKobo!;
      state.result = {
        walletBalanceKobo: wallet.availableBalance,
        withdrawals,
        operations,
        entries,
        expectedPrincipalKobo,
        observedBalanceDeltaKobo,
        deltaDriftKobo: observedBalanceDeltaKobo - expectedPrincipalKobo,
        accountReconciliationCertified: false,
        sessionComplete:
          operations.length === 3 &&
          operations.every((op) => op.status === 'RECORDED') &&
          wallet.availableBalance === 0 &&
          observedBalanceDeltaKobo === expectedPrincipalKobo,
      };
      if (
        ['refund', 'withdraw', 'sweep'].includes(action!) &&
        operations.some((op) => op.status !== 'RECORDED')
      )
        process.exitCode = 2;
      save();
      if (action === 'cleanup') {
        assert.ok(
          operations.length >= 3 && operations.every((op) => op.status === 'RECORDED'),
          'Unfinished provider operations: retain session',
        );
        assert.equal(wallet.availableBalance, 0);
        assert.equal(withdrawals.length, 1);
        assert.equal(withdrawals[0]!.status, 'PAID');
        assert.equal(
          observedBalanceDeltaKobo - expectedPrincipalKobo,
          0,
          'Unexplained account movement; retain evidence',
        );
        for (const id of state.scenario.bookingIds) assert.equal(await bookingLedgerSum(id), 0);
        await prisma.$disconnect();
        await control.$executeRawUnsafe(`DROP SCHEMA "${state.schema}" CASCADE`);
        const remaining = await control.$queryRawUnsafe<unknown[]>(
          'SELECT 1 FROM pg_namespace WHERE nspname = $1',
          state.schema,
        );
        assert.equal(remaining.length, 0);
        state.cleaned = true;
        save();
      }
    }
  }
  console.log(
    JSON.stringify(
      {
        action,
        schema: state.schema,
        checkoutUrl: action === 'start' ? state.checkoutUrl : undefined,
        openingBalanceKobo: state.openingBalanceKobo,
        currentBalanceKobo: state.currentBalanceKobo,
        result: state.result,
        cleaned: state.cleaned ?? false,
        evidence:
          'actual TEST calls; synthetic historical attendance; polling recovery; no live approval or provider callback-delivery certification',
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      result: 'incomplete',
      errorKind: error instanceof Error ? error.name : 'UnknownError',
      assertion:
        error instanceof Error && error.name === 'AssertionError'
          ? error.message.split('\n')[0]
          : undefined,
      sessionRetained: true,
    }),
  );
  process.exitCode = 1;
} finally {
  await prisma?.$disconnect();
  await control?.$disconnect();
  closeSync(lock);
  unlinkSync(lockPath);
}
