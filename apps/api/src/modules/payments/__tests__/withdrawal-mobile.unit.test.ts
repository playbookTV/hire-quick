import { describe, expect, it, vi } from 'vitest';
import { withdrawalResponseSchema, WITHDRAWAL_STATUSES } from '@hq/shared';
import { createWithdrawalController, withdrawalAttempt, withdrawalReceipt, withdrawalWasRejected, type WithdrawalStorage } from '../../../../../mobile/lib/withdrawal.js';
import { ApiError } from '../../../../../mobile/lib/api-error.js';

describe('mobile withdrawal contract and retry state', () => {
  const input = { bankAccountId: '00000000-0000-4000-8000-000000000001', amountKobo: 100_000 };

  it.each(WITHDRAWAL_STATUSES)('accepts %s and renders distinct receipt copy', (status) => {
    expect(withdrawalResponseSchema.parse({ ...input, withdrawalId: input.bankAccountId,
      status, availableBalance: 50_000, duplicate: false }).status).toBe(status);
    const receipt = withdrawalReceipt[status];
    expect(receipt.tone === 'success').toBe(status === 'PAID');
    expect(receipt.amountLabel === 'Amount sent').toBe(status === 'PAID');
    if (status === 'FAILED') expect(receipt.description).toContain('returned to your wallet');
  });

  it('rejects the old incorrect response shape and invalid money outcomes', () => {
    expect(withdrawalResponseSchema.safeParse({ id: input.bankAccountId, status: 'PAID' }).success).toBe(false);
    expect(withdrawalResponseSchema.safeParse({ ...input, withdrawalId: input.bankAccountId,
      status: 'FAILED', duplicate: false, availableBalance: -1 }).success).toBe(false);
  });

  it('keeps key and frozen input for retries, refusing partial edits until resolved', () => {
    const key = vi.fn(() => 'stable-key');
    const original = { ...input };
    const first = withdrawalAttempt(null, original, key);
    original.amountKobo = 2;
    expect(withdrawalAttempt(first, input, key)).toBe(first);
    for (const changed of [{ ...input, amountKobo: 200_000 }, { ...input, bankAccountId: 'changed' }]) {
      expect(() => withdrawalAttempt(first, changed, key)).toThrow('previous withdrawal');
    }
    expect(first.input).toEqual(input);
    expect(key).toHaveBeenCalledTimes(1);
    const next = withdrawalAttempt(null, { ...input, amountKobo: 200_000 }, () => 'new-key');
    expect(next.key).toBe('new-key');
  });

  it('unlocks editing only after explicit pre-acceptance rejection', () => {
    expect(withdrawalWasRejected(new ApiError(403, 'UNVERIFIED_ACCOUNT', 'verify'))).toBe(true);
    expect(withdrawalWasRejected(new ApiError(500, 'INTERNAL', 'failed'))).toBe(false);
    expect(withdrawalWasRejected(new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'conflict'))).toBe(false);
    expect(withdrawalWasRejected(new Error('Network error'))).toBe(false);
  });

  function storage(): WithdrawalStorage {
    const saved = new Map<string, string>();
    return {
      read: async (user) => saved.get(user) ?? null,
      write: async (user, value) => { saved.set(user, value); },
      remove: async (user) => { saved.delete(user); },
    };
  }
  const response = { ...input, withdrawalId: input.bankAccountId, status: 'PROCESSING',
    availableBalance: 50_000, duplicate: false };

  it('resumes the persisted key after controller recreation and isolates other users', async () => {
    const saved = storage();
    const first = createWithdrawalController(saved, async () => { throw new Error('response lost'); }, () => 'original-key');
    await expect(first.submit('user-a', input)).rejects.toMatchObject({ retryRequired: true });
    const send = vi.fn(async () => response);
    const restarted = createWithdrawalController(saved, send, () => 'different-key');
    expect(await restarted.load('user-b')).toBeNull();
    await restarted.submit('user-a', input);
    expect(send).toHaveBeenCalledWith(input, 'original-key');
    expect((await restarted.load('user-a'))?.outcome).toEqual(response);
    await restarted.acknowledge('user-a', response.withdrawalId);
    expect(await restarted.load('user-a')).toBeNull();
  });

  it('joins concurrent submissions before storage hydration, using one dispatch', async () => {
    const send = vi.fn(async () => response);
    const controller = createWithdrawalController(storage(), send, () => 'concurrent-key');
    const [a, b] = await Promise.all([controller.submit('user-a', input), controller.submit('user-a', input)]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it.each(['FORBIDDEN', 'UNVERIFIED_ACCOUNT'])('retains an uncertain intent after retry %s', async (code) => {
    const saved = storage();
    const send = vi.fn().mockRejectedValueOnce(new Error('network')).mockRejectedValue(new ApiError(403, code, 'rejected'));
    const controller = createWithdrawalController(saved, send, () => 'persisted-key');
    await expect(controller.submit('user-a', input)).rejects.toMatchObject({ retryRequired: true });
    await expect(controller.submit('user-a', input)).rejects.toMatchObject({ retryRequired: true });
    expect((await controller.load('user-a'))?.key).toBe('persisted-key');
    await expect(controller.submit('user-a', { ...input, amountKobo: 5 })).rejects.toThrow('previous withdrawal');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('clears a first-dispatch rejection so corrected details receive a fresh key', async () => {
    const saved = storage();
    const send = vi.fn().mockRejectedValueOnce(new ApiError(403, 'UNVERIFIED_ACCOUNT', 'rejected')).mockResolvedValue({ ...response, amountKobo: 200_000 });
    const makeKey = vi.fn().mockReturnValueOnce('rejected-key').mockReturnValue('corrected-key');
    const controller = createWithdrawalController(saved, send, makeKey);
    await expect(controller.submit('user-a', input)).rejects.toMatchObject({ retryRequired: false });
    expect(await controller.load('user-a')).toBeNull();
    await controller.submit('user-a', { ...input, amountKobo: 200_000 });
    expect(send).toHaveBeenLastCalledWith({ ...input, amountKobo: 200_000 }, 'corrected-key');
  });

  it('does not dispatch when the checkpoint cannot be written or loaded', async () => {
    const saved = storage();
    const send = vi.fn(async () => response);
    const controller = createWithdrawalController(saved, send, () => 'checkpoint-key');
    vi.spyOn(saved, 'write').mockRejectedValue(new Error('keychain unavailable'));
    await expect(controller.submit('user-a', input)).rejects.toThrow('keychain unavailable');
    expect(send).not.toHaveBeenCalled();
    vi.spyOn(saved, 'read').mockResolvedValue('corrupt intent');
    await expect(controller.submit('user-a', input)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it('retains the key if the response belongs to a different request', async () => {
    const saved = storage();
    const controller = createWithdrawalController(saved, async () => ({ ...response, amountKobo: 1 }), () => 'mismatch-key');
    await expect(controller.submit('user-a', input)).rejects.toMatchObject({ retryRequired: true });
    expect((await controller.load('user-a'))?.key).toBe('mismatch-key');
  });

  it('restores a successful response after restart without sending another transfer', async () => {
    const saved = storage();
    const send = vi.fn(async () => response);
    await createWithdrawalController(saved, send, () => 'receipt-key').submit('user-a', input);
    const restarted = createWithdrawalController(saved, send, () => 'unused-key');
    expect((await restarted.load('user-a'))?.outcome).toEqual(response);
    expect(await restarted.submit('user-a', input)).toEqual(response);
    expect(send).toHaveBeenCalledTimes(1);
    await restarted.acknowledge('user-a', response.withdrawalId);
    expect(await restarted.load('user-a')).toBeNull();
  });

  it('rejects mismatched acknowledgment and preserves the receipt on storage failure', async () => {
    const saved = storage();
    const controller = createWithdrawalController(saved, async () => response, () => 'receipt-key');
    await controller.submit('user-a', input);
    await expect(controller.acknowledge('user-a', 'another-withdrawal')).rejects.toThrow('does not match');
    expect((await controller.load('user-a'))?.outcome).toEqual(response);
    vi.spyOn(saved, 'remove').mockRejectedValueOnce(new Error('keychain unavailable'));
    await expect(controller.acknowledge('user-a', response.withdrawalId)).rejects.toThrow('keychain unavailable');
    expect((await controller.load('user-a'))?.outcome).toEqual(response);
    await controller.acknowledge('user-a', response.withdrawalId);
    expect(await controller.load('user-a')).toBeNull();
  });

  it('joins double Done and blocks a new submission until acknowledgment finishes', async () => {
    const saved = storage();
    const send = vi.fn(async () => response);
    const controller = createWithdrawalController(saved, send, () => 'receipt-key');
    await controller.submit('user-a', input);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const remove = saved.remove;
    const deletion = vi.spyOn(saved, 'remove').mockImplementation(async (user) => { await gate; await remove(user); });
    const first = controller.acknowledge('user-a', response.withdrawalId);
    const second = controller.acknowledge('user-a', response.withdrawalId);
    expect(second).toBe(first);
    await expect(controller.submit('user-a', input)).rejects.toThrow('acknowledgment');
    await expect(controller.acknowledge('user-a', 'different')).rejects.toThrow('different withdrawal');
    release();
    await Promise.all([first, second]);
    expect(deletion).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await controller.load('user-a')).toBeNull();
    await controller.submit('user-a', input);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('retains the original intent when saving the successful receipt fails', async () => {
    const saved = storage();
    const originalWrite = saved.write;
    vi.spyOn(saved, 'write').mockImplementationOnce(originalWrite).mockRejectedValueOnce(new Error('receipt write failed'));
    const send = vi.fn(async () => response);
    const controller = createWithdrawalController(saved, send, () => 'receipt-key');
    await expect(controller.submit('user-a', input)).rejects.toMatchObject({ retryRequired: true });
    expect(await controller.load('user-a')).toEqual({ key: 'receipt-key', input });
  });
});
