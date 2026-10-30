import { describe, expect, it } from 'vitest';
import { ApiError } from '../api-error.js';
import {
  createWithdrawalController,
  PAYOUTS_SCHEDULED,
  WithdrawalAttemptError,
  type WithdrawalStorage,
} from '../withdrawal.js';

const input = { bankAccountId: '0b6f1d2e-3c4a-4b5c-8d9e-0f1a2b3c4d5e', amountKobo: 150_000 };
const scheduled = (): ApiError =>
  new ApiError(
    409,
    PAYOUTS_SCHEDULED,
    'Payouts are sent every Thursday to your payout account. You do not need to withdraw.',
  );

function memoryStorage(initial?: string): WithdrawalStorage & { value: string | null } {
  const store = {
    value: initial ?? null,
    read: () => Promise.resolve(store.value),
    write: (_userId: string, value: string) => {
      store.value = value;
      return Promise.resolve();
    },
    remove: () => {
      store.value = null;
      return Promise.resolve();
    },
  };
  return store;
}

describe('withdrawals while weekly payout runs are on', () => {
  it('drops a first attempt the API refused, so nothing stays pending', async () => {
    const storage = memoryStorage();
    const controller = createWithdrawalController(
      storage,
      () => Promise.reject(scheduled()),
      () => 'key-00000001',
    );
    const error = await controller.submit('u1', input).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WithdrawalAttemptError);
    expect(error).toMatchObject({ retryRequired: false, code: PAYOUTS_SCHEDULED });
    expect(storage.value).toBeNull();
  });

  it('keeps a saved attempt, because a replay is refused before the key is looked up', async () => {
    const saved = JSON.stringify({ key: 'key-00000001', input });
    const storage = memoryStorage(saved);
    const keys: string[] = [];
    const controller = createWithdrawalController(
      storage,
      (_input, key) => {
        keys.push(key);
        return Promise.reject(scheduled());
      },
      () => 'key-00000002',
    );
    const error = await controller.submit('u1', input).catch((e: unknown) => e);
    expect(error).toMatchObject({ retryRequired: true, code: PAYOUTS_SCHEDULED });
    expect(keys).toEqual(['key-00000001']);
    expect(storage.value).toBe(saved);
  });

  it('leaves the code empty when the outcome is unknown for another reason', async () => {
    const storage = memoryStorage();
    const controller = createWithdrawalController(
      storage,
      () => Promise.reject(new Error('Network request failed')),
      () => 'key-00000001',
    );
    const error = await controller.submit('u1', input).catch((e: unknown) => e);
    expect(error).toMatchObject({ retryRequired: true, code: undefined });
    expect(storage.value).not.toBeNull();
  });
});
