import { describe, expect, it, vi } from 'vitest';
import type { PaymentOperation, PrismaClient, Prisma } from '@hq/database';
import { runOperation } from './operations.js';

/** Transaction double with rollback and serialization. Not proof of PostgreSQL locking. */
function database() {
  const state = {
    op: {
      id: 'op',
      status: 'PENDING',
      attempts: 0,
      providerRef: null,
      lastError: null,
    } as PaymentOperation,
    ledger: [] as number[],
  };
  let tail = Promise.resolve();
  const update = (args: { data: Record<string, unknown> }) => {
    const { attempts, ...rest } = args.data;
    Object.assign(state.op, rest);
    if (attempts) state.op.attempts += (attempts as { increment: number }).increment;
    return Promise.resolve(structuredClone(state.op));
  };
  const tx = {
    $queryRaw: async () => [],
    paymentOperation: {
      findUniqueOrThrow: async () => structuredClone(state.op),
      update,
    },
  } as unknown as Prisma.TransactionClient;
  const db = {
    paymentOperation: {
      updateMany: async (a: { data: Record<string, unknown> }) => {
        await update(a);
        return { count: 1 };
      },
    },
    $transaction: async <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => {
      const prior = tail;
      let unlock!: () => void;
      tail = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      await prior;
      const before = structuredClone(state);
      try {
        return await fn(tx);
      } catch (e) {
        state.op = before.op;
        state.ledger = before.ledger;
        throw e;
      } finally {
        unlock();
      }
    },
  } as unknown as PrismaClient;
  return { db, state, op: structuredClone(state.op) };
}

describe('durable operation failure boundaries', () => {
  it('persists confirmation when the ledger transaction fails, then records once across concurrent resumes', async () => {
    const { db, state, op } = database();
    const provider = vi.fn(async () => ({ status: 'success' as const }));
    const reconcile = vi.fn(async () => ({ status: 'unknown' as const }));
    await expect(
      runOperation(db, op, {
        provider,
        reconcile,
        onSuccess: async () => {
          state.ledger.push(100);
          throw new Error('ledger crash');
        },
      }),
    ).rejects.toThrow('ledger crash');
    expect(state.op.status).toBe('PROVIDER_OK');
    expect(state.ledger).toEqual([]);
    const onSuccess = vi.fn(async () => {
      state.ledger.push(100);
      return 100;
    });
    await Promise.all([
      runOperation(db, op, { provider, reconcile, onSuccess }),
      runOperation(db, op, { provider, reconcile, onSuccess }),
    ]);
    expect(state.ledger).toEqual([100]);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(reconcile).not.toHaveBeenCalled();
    expect(state.op.status).toBe('RECORDED');
  });
  it('commits dispatch before the call, and only reconciles after a lost response', async () => {
    const { db, state, op } = database();
    const provider = vi.fn(async () => {
      expect(state.op.attempts).toBe(1);
      throw new Error('response lost');
    });
    const reconcile = vi.fn(async () => ({ status: 'unknown' as const }));
    const onSuccess = vi.fn();
    const onFailure = vi.fn();
    expect((await runOperation(db, op, { provider, reconcile, onSuccess, onFailure })).status).toBe(
      'PENDING',
    );
    await runOperation(db, op, { provider, reconcile, onSuccess, onFailure });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(onFailure).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });
  it('does not compensate pending evidence, but atomically compensates a confirmed failure once', async () => {
    const { db, state, op } = database();
    const provider = vi.fn(async () => ({ status: 'pending' as const }));
    const reconcile = vi.fn(async () => ({ status: 'failed' as const }));
    const onSuccess = vi.fn();
    const onFailure = vi.fn(async () => {
      state.ledger.push(500);
    });
    await runOperation(db, op, { provider, reconcile, onSuccess, onFailure });
    expect(state.ledger).toEqual([]);
    await Promise.all([
      runOperation(db, op, { provider, reconcile, onSuccess, onFailure }),
      runOperation(db, op, { provider, reconcile, onSuccess, onFailure }),
    ]);
    expect(state.ledger).toEqual([500]);
    expect(state.op.status).toBe('FAILED');
    expect(onSuccess).not.toHaveBeenCalled();
  });
  it('rolls compensation and FAILED back together', async () => {
    const { db, state, op } = database();
    const provider = vi.fn(async () => ({ status: 'failed' as const }));
    const reconcile = vi.fn(async () => ({ status: 'failed' as const }));
    await expect(
      runOperation(db, op, {
        provider,
        reconcile,
        onSuccess: vi.fn(),
        onFailure: async () => {
          state.ledger.push(500);
          throw new Error('compensation crash');
        },
      }),
    ).rejects.toThrow('compensation crash');
    expect(state.op.status).toBe('PENDING');
    expect(state.ledger).toEqual([]);
  });
});
