import { randomUUID } from 'node:crypto';
import type { PaymentOperation, Prisma, PrismaClient } from '@hq/database';

const LEASE_MS = 5 * 60_000;
const TX = { timeout: 30_000, maxWait: 30_000 };
interface DispatchLease { owner: string; expiresAt: number }
type Claim = { state: 'busy' } | { state: 'settled'; op: PaymentOperation } |
  { state: 'claimed'; op: PaymentOperation; owner: string };

function payloadOf(op: PaymentOperation): Prisma.InputJsonObject {
  if (!op.payload || typeof op.payload !== 'object' || Array.isArray(op.payload))
    throw new Error('Invalid transfer operation payload');
  return op.payload;
}

function leaseOf(payload: Prisma.InputJsonObject): DispatchLease | null {
  const lease = payload.dispatchLease;
  if (lease === undefined) return null;
  if (!lease || typeof lease !== 'object' || Array.isArray(lease) ||
      !('owner' in lease) || typeof lease.owner !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(lease.owner) ||
      !('expiresAt' in lease) || !Number.isSafeInteger(lease.expiresAt) || Number(lease.expiresAt) <= 0)
    throw new Error('Invalid transfer dispatch lease; operator review required');
  return { owner: lease.owner, expiresAt: Number(lease.expiresAt) };
}

async function locked(tx: Prisma.TransactionClient, id: string) {
  const [clock] = await tx.$queryRaw<{ now: Date }[]>`
    SELECT clock_timestamp() AS now FROM payment_operations WHERE id = ${id}::uuid FOR UPDATE`;
  if (!clock) throw new Error('Transfer operation not found');
  return { op: await tx.paymentOperation.findUniqueOrThrow({ where: { id } }), now: clock.now.getTime() };
}

/** Committed exclusion across processes; no provider I/O runs under this lock.
 * Five minutes exceeds the HTTP adapter's 15-second request timeout and checkpoint
 * budget. After a crash, an expired owner is replaced and verification still runs
 * before any same-reference reissue. The lease spans the provider checkpoint.
 */
export async function claimTransferDispatch(prisma: PrismaClient, id: string): Promise<Claim> {
  return prisma.$transaction(async tx => {
    const { op, now } = await locked(tx, id);
    if (op.status !== 'PENDING') return { state: 'settled', op };
    const payload = payloadOf(op);
    const lease = leaseOf(payload);
    if (lease && lease.expiresAt > now) return { state: 'busy' };
    const owner = randomUUID();
    const updated = await tx.paymentOperation.update({ where: { id }, data: {
      payload: { ...payload, dispatchLease: { owner, expiresAt: now + LEASE_MS } },
    } });
    return { state: 'claimed', op: updated, owner };
  }, TX);
}

/** Re-read after provider verification; stale callers may not issue a POST. */
export async function ownsTransferDispatch(prisma: PrismaClient, id: string, owner: string) {
  return prisma.$transaction(async tx => {
    const { op, now } = await locked(tx, id);
    if (op.status !== 'PENDING') return false;
    const lease = leaseOf(payloadOf(op));
    return lease?.owner === owner && lease.expiresAt > now;
  }, TX);
}

export async function releaseTransferDispatch(prisma: PrismaClient, id: string, owner: string) {
  await prisma.$transaction(async tx => {
    const { op } = await locked(tx, id);
    const payload = payloadOf(op);
    if (leaseOf(payload)?.owner !== owner) return;
    const rest = { ...payload };
    delete rest.dispatchLease;
    await tx.paymentOperation.update({ where: { id }, data: { payload: rest } });
  }, TX);
}
