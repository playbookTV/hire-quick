import { describe, expect, it } from 'vitest';
import {
  canOpenPushTarget,
  parsePushData,
  pushAction,
  pushRoute,
  shouldShowPushPrompt,
} from '../push-routing.js';
import type { Me, UsherProfile } from '../types.js';

const dispatchId = '7d0c3f0e-8f5e-4a52-9a43-2f6b6f1d2e10';
const WEEK = 7 * 24 * 60 * 60_000;

describe('push data', () => {
  it('reads the data the API attaches', () => {
    expect(
      parsePushData({ type: 'INVITATION_RECEIVED', targetType: 'invitation', targetId: 'i-1', dispatchId }),
    ).toEqual({ type: 'INVITATION_RECEIVED', targetType: 'invitation', targetId: 'i-1', dispatchId });
    expect(parsePushData({ type: 'PAYOUT_RELEASED', dispatchId })).toEqual({
      type: 'PAYOUT_RELEASED',
      dispatchId,
    });
  });

  it.each([null, undefined, 'text', {}, { type: 'X' }, { type: 'X', dispatchId: 'not-a-uuid' }])(
    'ignores notifications that are not HireQuick pushes (%j)',
    (data) => {
      expect(parsePushData(data)).toBeNull();
    },
  );
});

describe('push buttons', () => {
  it('maps button identifiers and treats everything else as a tap', () => {
    expect(pushAction('view')).toBe('view');
    expect(pushAction('apply')).toBe('apply');
    expect(pushAction('expo.modules.notifications.actions.DEFAULT')).toBe('open');
    expect(pushAction('accept')).toBe('open');
  });

  it('only ever opens a screen, by role', () => {
    const data = { type: 'JOB_ALERT', targetType: 'event', targetId: 'e-1', dispatchId };
    expect(pushRoute(data, 'USHER')).toEqual({
      pathname: '/(modals)/event-details',
      params: { id: 'e-1' },
    });
    expect(pushRoute({ type: 'PAYOUT_RELEASED', dispatchId }, 'USHER')).toBeNull();
  });
});

describe('push prompt', () => {
  const now = 1_000 * WEEK;
  it('asks until push is fully on', () => {
    expect(shouldShowPushPrompt({ permission: 'undetermined', consent: 'none', dismissedAt: null, now })).toBe(true);
    expect(shouldShowPushPrompt({ permission: 'granted', consent: 'none', dismissedAt: null, now })).toBe(true);
    // A new phone for an account that already said yes still needs the OS permission.
    expect(shouldShowPushPrompt({ permission: 'undetermined', consent: 'granted', dismissedAt: null, now })).toBe(true);
    expect(shouldShowPushPrompt({ permission: 'granted', consent: 'granted', dismissedAt: null, now })).toBe(false);
  });

  it('respects an explicit no from the account or the phone', () => {
    expect(shouldShowPushPrompt({ permission: 'undetermined', consent: 'withdrawn', dismissedAt: null, now })).toBe(false);
    expect(shouldShowPushPrompt({ permission: 'denied', consent: 'none', dismissedAt: null, now })).toBe(false);
  });

  it('comes back a week after "Not now"', () => {
    const base = { permission: 'undetermined', consent: 'none' } as const;
    expect(shouldShowPushPrompt({ ...base, dismissedAt: now - WEEK + 1, now })).toBe(false);
    expect(shouldShowPushPrompt({ ...base, dismissedAt: now - WEEK, now })).toBe(true);
  });
});

describe('opening a tapped notification', () => {
  const usher: Me = {
    id: 'usher-user',
    role: 'USHER',
    phone: '+2348000000001',
    email: null,
    status: 'ACTIVE',
    client: null,
    usher: { displayName: 'Ada', bio: 'Five years at Lagos events.' } as UsherProfile,
  };
  const client: Me = {
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
      accountType: 'INDIVIDUAL',
      verificationStatus: 'VERIFIED',
    },
  };

  it.each(['(usher)', '(client)', '(modals)', 'jobs'])('opens from %s once onboarding is done', (group) => {
    expect(canOpenPushTarget(usher, group)).toBe(true);
    expect(canOpenPushTarget(client, group)).toBe(true);
  });

  it.each(['(auth)', '(verification)', undefined])('waits while on %s', (group) => {
    expect(canOpenPushTarget(usher, group)).toBe(false);
    expect(canOpenPushTarget(client, group)).toBe(false);
  });

  it('waits until onboarding is finished, as the tab guards require', () => {
    expect(canOpenPushTarget(null, '(modals)')).toBe(false);
    expect(canOpenPushTarget({ ...usher, usher: { ...usher.usher!, bio: null } }, '(modals)')).toBe(false);
    expect(
      canOpenPushTarget({ ...client, client: { ...client.client!, verificationStatus: 'PENDING' } }, '(modals)'),
    ).toBe(false);
    expect(canOpenPushTarget({ ...client, role: 'ADMIN' }, '(modals)')).toBe(false);
  });
});
