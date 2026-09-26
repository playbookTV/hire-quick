import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@hq/database';
import { createBankAccountForUsher } from '../service.js';
import { InMemoryPaystack } from '../port/paystack-port.js';

afterEach(() => vi.restoreAllMocks());
const params = { usherId: 'usher-owner', bankCode: '058', accountNumber: '0123456789' };

describe('verified payout bank registration', () => {
  it('persists the server-resolved name and original account including leading zeroes', async () => {
    const paystack = new InMemoryPaystack();
    const resolve = vi
      .spyOn(paystack, 'resolveAccount')
      .mockResolvedValue({ accountName: 'Resolved Person' });
    const recipient = vi
      .spyOn(paystack, 'createTransferRecipient')
      .mockResolvedValue({ recipientCode: 'RCP_test' });
    const save = vi
      .spyOn(prisma.bankAccount, 'create')
      .mockResolvedValue({ id: 'saved-bank' } as Awaited<
        ReturnType<typeof prisma.bankAccount.create>
      >);
    expect(
      await createBankAccountForUsher({ prisma, paystack }, {
        ...params,
        accountName: 'Spoofed Person',
      } as typeof params),
    ).toEqual({
      id: 'saved-bank',
      accountName: 'Resolved Person',
      recipientCode: 'RCP_test',
    });
    expect(resolve).toHaveBeenCalledWith({ bankCode: '058', accountNumber: '0123456789' });
    expect(recipient).toHaveBeenCalledWith({
      bankCode: '058',
      accountNumber: '0123456789',
      accountName: 'Resolved Person',
    });
    expect(save).toHaveBeenCalledWith({
      data: {
        ...params,
        accountName: 'Resolved Person',
        paystackRecipientCode: 'RCP_test',
        verified: true,
      },
    });
  });

  it.each(['resolve', 'recipient'] as const)(
    'does not save a verified account when %s fails',
    async (stage) => {
      const paystack = new InMemoryPaystack();
      const resolve = vi
        .spyOn(paystack, 'resolveAccount')
        .mockResolvedValue({ accountName: 'Resolved Person' });
      const recipient = vi
        .spyOn(paystack, 'createTransferRecipient')
        .mockRejectedValue(new Error('provider unavailable'));
      if (stage === 'resolve') resolve.mockRejectedValue(new Error('invalid account'));
      const save = vi.spyOn(prisma.bankAccount, 'create');
      await expect(createBankAccountForUsher({ prisma, paystack }, params)).rejects.toThrow();
      expect(save).not.toHaveBeenCalled();
      expect(recipient).toHaveBeenCalledTimes(stage === 'resolve' ? 0 : 1);
    },
  );
});
