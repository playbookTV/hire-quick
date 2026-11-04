import { expect, it } from 'vitest';
import { clientCanHire, clientTrustLabel } from '../client-verification.js';

it('fails closed for legacy, pending, rejected and incomplete business accounts', () => {
  for (const client of [
    null,
    {},
    { accountType: 'INDIVIDUAL' as const, verificationStatus: 'PENDING' },
    {
      accountType: 'BUSINESS' as const,
      verificationStatus: 'VERIFIED',
      businessVerificationStatus: 'PENDING',
    },
    {
      accountType: 'BUSINESS' as const,
      verificationStatus: 'REJECTED',
      businessVerificationStatus: 'VERIFIED',
    },
  ])
    expect(clientCanHire(client)).toBe(false);
});
it('separates identity trust from business trust', () => {
  const individual = { accountType: 'INDIVIDUAL' as const, verificationStatus: 'VERIFIED' };
  expect(clientCanHire(individual)).toBe(true);
  expect(clientTrustLabel(individual)).toBe('Identity verified');
  expect(
    clientTrustLabel({
      ...individual,
      accountType: 'BUSINESS',
      businessVerificationStatus: 'PENDING',
    }),
  ).toBe('Identity verified');
  const business = {
    ...individual,
    accountType: 'BUSINESS' as const,
    businessVerificationStatus: 'VERIFIED',
  };
  expect(clientCanHire(business)).toBe(true);
  expect(clientTrustLabel(business)).toBe('Business verified');
});
