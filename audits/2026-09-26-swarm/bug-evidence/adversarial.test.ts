import { describe, expect, it } from 'vitest';
import { parseNairaInput, nairaInput } from '../../../apps/mobile/lib/amount-input.js';
import { checkoutStorage } from '../../../apps/mobile/lib/checkout-storage.js';
import { createCheckoutController } from '../../../apps/mobile/lib/checkout.js';

describe('bounded audit: monetary input and checkpoint interruption', () => {
  it('round-trips 10,000 deterministic integer-kobo balances within database range', () => {
    let seed = 20260926;
    for (let i = 0; i < 10_000; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const kobo = seed % 2147483648;
      expect(parseNairaInput(nairaInput(kobo))).toBe(kobo);
    }
  });
  it('preserves the newly published receipt when native manifest acknowledgement is lost', async () => {
    const data = new Map<string, string>();
    let failManifest = false;
    let revision = 0;
    const native = {
      getItemAsync: async (key: string) => data.get(key) ?? null,
      setItemAsync: async (key: string, value: string) => {
        data.set(key, value);
        if (failManifest && key === 'audit.scope') throw new Error('acknowledgement lost');
      },
      deleteItemAsync: async (key: string) => { data.delete(key); },
    };
    const make = () => checkoutStorage(native, () => `r${++revision}`, 'audit');
    await make().write('scope', 'original');
    failManifest = true;
    await expect(make().write('scope', 'replacement')).rejects.toThrow('acknowledgement lost');
    expect(await make().read('scope')).toBe('replacement');
  });
  it('blocks dispatch when a published checkout chunk has disappeared', async () => {
    const data = new Map<string, string>();
    const native = {
      getItemAsync: async (key: string) => data.get(key) ?? null,
      setItemAsync: async (key: string, value: string) => { data.set(key, value); },
      deleteItemAsync: async (key: string) => { data.delete(key); },
    };
    const eventId = '11111111-1111-4111-8111-111111111111';
    const input = { applicationIds: ['33333333-3333-4333-8333-333333333333'], email: 'fixture@example.test' };
    const storage = checkoutStorage(native, () => 'revision', 'audit');
    await storage.write(`user.${eventId}`, JSON.stringify({ eventId, input, key: 'original-key' }));
    data.delete(`audit.user.${eventId}.revision.0`);
    let calls = 0;
    const transport = {
      confirm: async () => { calls++; throw new Error('Unexpected dispatch'); },
      resume: async () => { throw new Error('Unexpected resume'); },
      status: async () => { throw new Error('Unexpected status'); },
    };
    const controller = createCheckoutController(storage, transport, () => 'replacement-key');
    await expect(controller.submit('user', eventId, input)).rejects.toThrow('incomplete');
    expect(calls).toBe(0);
  });
});
