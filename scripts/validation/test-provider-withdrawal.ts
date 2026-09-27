/** Prepared TEST-provider probe: requires explicit user approval; excluded from test discovery. */
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { prisma } from '../../packages/database/src/index.js';
import { HttpPaystack } from '../../apps/api/src/modules/payments/port/http-paystack.js';
import {
  holdOrder,
  markCheckedIn,
  releaseBooking,
} from '../../apps/api/src/modules/payments/ledger/ledger.js';
import { initWithdrawal, driveTransfer } from '../../apps/api/src/modules/payments/service.js';
import {
  createScenario,
  teardown,
  type Scenario,
} from '../../apps/api/src/modules/payments/__tests__/fixtures.js';
import { idempotencyStorageKey } from '../../apps/api/src/modules/payments/ledger/idempotency.js';

const requireApi = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const configured = requireApi('dotenv').parse(readFileSync(new URL('../../.env', import.meta.url)));
const secret: string = configured.PAYSTACK_SECRET_KEY ?? '';
if (!/^sk_test_[A-Za-z0-9]+$/.test(secret)) throw new Error('A TEST secret is required');
const schema = new URL(process.env.DATABASE_URL!).searchParams.get('schema');
assert.match(schema ?? '', /^hq_validation_/);
const [isolation] = await prisma.$queryRaw<{ schema: string }[]>`SELECT current_schema() AS schema`;
assert.equal(isolation?.schema, schema);
const recipient = process.env.HQ_TEST_RECIPIENT;
assert.ok(
  recipient?.startsWith('RCP_'),
  'An explicitly approved existing TEST recipient is required',
);
const amount = 10_000;
let posts = 0;
let reference: string | undefined;
const observations: {
  method: string;
  path: string;
  httpStatus: number;
  domain?: string;
  status?: string;
}[] = [];
const guardedFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  assert.equal(url.origin, 'https://api.paystack.co');
  const method = init?.method ?? 'GET';
  assert.ok(
    url.pathname === '/balance' ||
      url.pathname === '/transfer' ||
      url.pathname.startsWith('/transfer/verify/'),
  );
  if (method === 'POST') {
    assert.equal(url.pathname, '/transfer');
    assert.equal(posts, 0, 'A second transfer POST is forbidden');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.amount, amount);
    assert.equal(body.currency, 'NGN');
    assert.equal(body.recipient, recipient);
    assert.match(body.reference, /^wd_[a-f0-9-]{36}$/);
    reference = body.reference;
    posts += 1;
  } else assert.equal(method, 'GET');
  const response = await fetch(input, init);
  const raw: unknown = await response.clone().json();
  assert.ok(raw && typeof raw === 'object');
  const payload = raw as { status?: boolean; data?: Record<string, unknown> };
  const row = {
    method,
    path: url.pathname.startsWith('/transfer/verify/')
      ? '/transfer/verify/:reference'
      : url.pathname,
    httpStatus: response.status,
  } as (typeof observations)[number];
  if (response.ok && payload.status && url.pathname !== '/balance') {
    assert.ok(payload.data && typeof payload.data === 'object');
    assert.equal(payload.data.domain, 'test', 'Provider did not confirm TEST domain');
    assert.equal(payload.data.currency, 'NGN');
    assert.equal(payload.data.amount, amount);
    if (reference) assert.equal(payload.data.reference, reference);
    row.domain = 'test';
    assert.equal(typeof payload.data.status, 'string');
    row.status = String(payload.data.status);
  }
  observations.push(row);
  return response;
};
const paystack = new HttpPaystack(secret, guardedFetch);
const evidence: Record<string, unknown> = {
  mode: 'test',
  amountKobo: amount,
  seededWallet: true,
  fundedChargeLifecycle: false,
  observations,
};
let scenario: Scenario | undefined;
const key = randomUUID();
try {
  const before = await paystack.getBalanceKobo();
  scenario = await createScenario({ headcount: 1, amountKobo: 20_000 });
  await prisma.$transaction((tx) =>
    holdOrder(tx, scenario!.orderId, `synthetic-validation-${scenario!.orderId}`),
  );
  await prisma.$transaction((tx) => markCheckedIn(tx, scenario!.bookingIds[0]!, 'OTP'));
  await prisma.$transaction((tx) => releaseBooking(tx, scenario!.bookingIds[0]!, 'OTP'));
  const bank = await prisma.bankAccount.create({
    data: {
      usherId: scenario.usherId,
      bankCode: '058',
      accountNumber: '0000000000',
      accountName: 'Synthetic validation fixture',
      verified: true,
      paystackRecipientCode: recipient!,
    },
  });
  const params = {
    idempotencyKey: key,
    usherId: scenario.usherId,
    walletId: scenario.walletId,
    bankAccountId: bank.id,
    amountKobo: amount,
  };
  const deps = { prisma, paystack };
  evidence.stage = 'initial_dispatch';
  const first = await initWithdrawal(deps, params);
  evidence.firstStatus = first.status;
  reference ??= `wd_${first.withdrawalId}`;
  evidence.reference = reference;
  evidence.stage = 'dispatch_count';
  assert.equal(posts, 1, 'The TEST transfer was not dispatched');
  evidence.stage = 'read_only_terminal_poll';
  let terminal: string = 'pending';
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const verified = await paystack.verifyTransfer(reference!);
    terminal = verified.status;
    if (terminal === 'success' || terminal === 'failed') break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  evidence.providerStatus = terminal;
  if (terminal === 'success' || terminal === 'failed') {
    const op = await prisma.paymentOperation.findUniqueOrThrow({
      where: { dedupeKey: `WITHDRAWAL_TRANSFER:${first.withdrawalId}` },
    });
    await driveTransfer(deps, op); // Existing terminal provider evidence makes this GET-only.
  }
  evidence.stage = 'exact_key_replay';
  const replay = await initWithdrawal(deps, params);
  assert.equal(replay.withdrawalId, first.withdrawalId);
  assert.equal(replay.duplicate, true);
  assert.equal(posts, 1);
  assert.equal(
    await prisma.walletLedger.count({ where: { walletId: scenario.walletId, entryType: 'DEBIT' } }),
    1,
  );
  const finalOperation = await prisma.paymentOperation.findUniqueOrThrow({
    where: { dedupeKey: `WITHDRAWAL_TRANSFER:${first.withdrawalId}` },
  });
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: scenario.walletId } });
  const reversals = await prisma.walletLedger.count({
    where: { walletId: scenario.walletId, entryType: 'REVERSAL' },
  });
  if (terminal === 'success') {
    assert.equal(replay.status, 'PAID');
    assert.equal(finalOperation.status, 'RECORDED');
    assert.equal(wallet.availableBalance, 7_000);
    assert.equal(reversals, 0);
  } else if (terminal === 'failed') {
    assert.equal(replay.status, 'FAILED');
    assert.equal(finalOperation.status, 'FAILED');
    assert.equal(wallet.availableBalance, 17_000);
    assert.equal(reversals, 1);
  } else {
    assert.equal(replay.status, 'PROCESSING');
    assert.equal(wallet.availableBalance, 7_000);
    assert.equal(reversals, 0);
    process.exitCode = 1;
  }
  evidence.operationStatus = finalOperation.status;
  evidence.walletBalanceKobo = wallet.availableBalance;
  evidence.walletReversalEntries = reversals;
  evidence.replayStatus = replay.status;
  evidence.transferPosts = posts;
  evidence.walletDebitEntries = 1;
  evidence.balanceDeltaKobo = (await paystack.getBalanceKobo()) - before;
  evidence.result =
    terminal === 'success'
      ? 'terminal_success_and_replay_verified'
      : terminal === 'failed'
        ? 'terminal_failure_and_replay_verified'
        : 'pending_terminal_evidence';
  evidence.stage = 'complete';
} catch (error) {
  // Avoid printing raw provider responses, recipient information or credentials.
  evidence.result = 'incomplete';
  evidence.errorKind = error instanceof Error ? error.name : 'UnknownError';
  evidence.reference = reference;
  evidence.transferPosts = posts;
  process.exitCode = 1;
} finally {
  writeFileSync(
    '/private/tmp/hq-actual-test-withdrawal-evidence.json',
    JSON.stringify(evidence, null, 2) + '\n',
    { mode: 0o600 },
  );
  process.stdout.write(JSON.stringify(evidence) + '\n');
  if (scenario) {
    await prisma.idempotencyKey.deleteMany({
      where: { key: idempotencyStorageKey(key, 'withdrawal', scenario.usherId) },
    });
    await teardown(scenario);
  }
  await prisma.$disconnect();
}
