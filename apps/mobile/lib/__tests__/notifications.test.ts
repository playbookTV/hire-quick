import { describe, expect, it } from 'vitest';
import { notificationIcon, notificationIsProblem, notificationRoute } from '../notifications.js';

describe('notification deep links', () => {
  it.each(['PAYOUT_SENT', 'PAYOUT_FAILED'])('opens the withdrawal behind a %s', (type) => {
    expect(notificationRoute({ targetType: 'withdrawal', targetId: 'w-1' }, 'USHER')).toEqual({
      pathname: '/(modals)/withdrawal-details',
      params: { id: 'w-1' },
    });
    expect(notificationIcon(type)).not.toBe('bell');
  });

  it('keeps the existing targets', () => {
    expect(notificationRoute({ targetType: 'booking', targetId: 'b-1' }, 'USHER')).toEqual({
      pathname: '/(modals)/booking-details',
      params: { booking: 'b-1' },
    });
    expect(notificationRoute({ targetType: 'invitation', targetId: 'i-1' }, 'USHER')?.pathname).toBe(
      '/(modals)/invitation',
    );
  });

  it('opens an event as the job for ushers and the event for clients', () => {
    expect(notificationRoute({ targetType: 'event', targetId: 'e-1' }, 'USHER')).toEqual({
      pathname: '/(modals)/event-details',
      params: { id: 'e-1' },
    });
    expect(notificationRoute({ targetType: 'event', targetId: 'e-1' }, 'CLIENT')).toEqual({
      pathname: '/(client)/events/[id]',
      params: { id: 'e-1' },
    });
  });

  it('opens the conversation behind a chat push', () => {
    expect(notificationRoute({ targetType: 'conversation', targetId: 'b-1' }, 'CLIENT')).toEqual({
      pathname: '/(modals)/message-thread',
      params: { booking: 'b-1' },
    });
  });

  it('opens nothing without a target or for an unknown one', () => {
    expect(notificationRoute({ targetType: 'withdrawal', targetId: null }, 'USHER')).toBeNull();
    expect(notificationRoute({ targetType: null, targetId: null }, 'USHER')).toBeNull();
    expect(notificationRoute({ targetType: 'payout-run', targetId: 'r-1' }, 'USHER')).toBeNull();
  });

  it('marks a failed payout as a problem and falls back to a bell', () => {
    expect(notificationIsProblem('PAYOUT_FAILED')).toBe(true);
    expect(notificationIsProblem('PAYOUT_SENT')).toBe(false);
    expect(notificationIcon('SOMETHING_NEW')).toBe('bell');
  });
});
