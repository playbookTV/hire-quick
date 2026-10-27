import { describe, expect, it } from 'vitest';
import { notificationIcon, notificationIsProblem, notificationRoute } from '../notifications.js';

describe('notification deep links', () => {
  it.each(['PAYOUT_SENT', 'PAYOUT_FAILED'])('opens the withdrawal behind a %s', (type) => {
    expect(notificationRoute({ targetType: 'withdrawal', targetId: 'w-1' })).toEqual({
      pathname: '/(modals)/withdrawal-details',
      params: { id: 'w-1' },
    });
    expect(notificationIcon(type)).not.toBe('bell');
  });

  it('keeps the existing targets', () => {
    expect(notificationRoute({ targetType: 'booking', targetId: 'b-1' })).toEqual({
      pathname: '/(modals)/booking-details',
      params: { booking: 'b-1' },
    });
    expect(notificationRoute({ targetType: 'invitation', targetId: 'i-1' })?.pathname).toBe(
      '/(modals)/invitation',
    );
  });

  it('opens nothing without a target or for an unknown one', () => {
    expect(notificationRoute({ targetType: 'withdrawal', targetId: null })).toBeNull();
    expect(notificationRoute({ targetType: null, targetId: null })).toBeNull();
    expect(notificationRoute({ targetType: 'payout-run', targetId: 'r-1' })).toBeNull();
  });

  it('marks a failed payout as a problem and falls back to a bell', () => {
    expect(notificationIsProblem('PAYOUT_FAILED')).toBe(true);
    expect(notificationIsProblem('PAYOUT_SENT')).toBe(false);
    expect(notificationIcon('SOMETHING_NEW')).toBe('bell');
  });
});
