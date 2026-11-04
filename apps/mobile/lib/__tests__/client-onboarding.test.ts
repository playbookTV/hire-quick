import { describe, expect, it } from 'vitest';
import { clientOnboardingRoute } from '../client-onboarding.js';
import type { Me } from '../types.js';

const user: Me = {
  id: 'client-user',
  role: 'CLIENT',
  phone: '+2348000000000',
  email: null,
  status: 'ACTIVE',
  usher: null,
  client: {
    id: 'client',
    userId: 'client-user',
    displayName: 'Alex',
    businessName: null,
    ratingAvg: 0,
    ratingCount: 0,
  },
};
describe('mandatory client onboarding', () => {
  it('routes legacy clients through account selection without granting access', () => {
    expect(clientOnboardingRoute(user)).toBe('/(verification)/account-type');
  });
  it('requires profile details before account selection', () => {
    expect(
      clientOnboardingRoute({ ...user, client: { ...user.client!, displayName: user.phone } }),
    ).toBe('/(auth)/complete-profile');
  });
  it('requires personal verification for individuals', () => {
    const client = { ...user.client!, accountType: 'INDIVIDUAL' as const };
    for (const verificationStatus of ['PENDING', 'REJECTED'] as const)
      expect(clientOnboardingRoute({ ...user, client: { ...client, verificationStatus } })).toBe(
        '/(verification)/client-verification',
      );
    expect(
      clientOnboardingRoute({ ...user, client: { ...client, verificationStatus: 'VERIFIED' } }),
    ).toBeNull();
  });
  it('requires both identity and business approval, including after an upgrade', () => {
    const client = {
      ...user.client!,
      accountType: 'BUSINESS' as const,
      verificationStatus: 'VERIFIED' as const,
    };
    for (const businessVerificationStatus of ['NOT_STARTED', 'PENDING', 'REJECTED'] as const)
      expect(
        clientOnboardingRoute({ ...user, client: { ...client, businessVerificationStatus } }),
      ).toBe('/(verification)/client-verification');
    expect(
      clientOnboardingRoute({
        ...user,
        client: { ...client, businessVerificationStatus: 'VERIFIED' },
      }),
    ).toBeNull();
    expect(
      clientOnboardingRoute({
        ...user,
        client: {
          ...client,
          verificationStatus: 'REJECTED',
          businessVerificationStatus: 'VERIFIED',
        },
      }),
    ).toBe('/(verification)/client-verification');
  });
  it('leaves usher onboarding unchanged', () => {
    expect(clientOnboardingRoute({ ...user, role: 'USHER', client: null })).toBeNull();
  });
});
