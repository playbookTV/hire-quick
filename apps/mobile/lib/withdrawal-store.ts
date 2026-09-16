import * as SecureStore from 'expo-secure-store';
import { api, newIdempotencyKey } from './client.js';
import { createWithdrawalController } from './withdrawal.js';

// Keep unresolved money intents per user across route close, restart and login.
// Done removes only that user's acknowledged receipt; token logout never drops it.
const storageKey = (userId: string): string => `hq.withdrawal.${userId}`;
export const withdrawalStore = createWithdrawalController({
  read: (userId) => SecureStore.getItemAsync(storageKey(userId)),
  write: (userId, value) => SecureStore.setItemAsync(storageKey(userId), value),
  remove: (userId) => SecureStore.deleteItemAsync(storageKey(userId)),
}, (input, key) => api.post<unknown>('/api/payments/withdrawals', input, { idempotencyKey: key }), newIdempotencyKey);
