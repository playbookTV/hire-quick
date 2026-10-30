/**
 * Where a notification opens and how it looks in the inbox. Pure so the
 * deep-link table is unit-tested; the screen only calls `router.push`.
 */
import type { IconName } from '../components/Icon.js';
import type { NotificationType, UserRole } from '@hq/shared';
import type { Notification } from './types.js';

export interface NotificationRoute {
  pathname: string;
  params: Record<string, string>;
}

/** The screen a notification's target opens for this role, or null when it has none. */
export function notificationRoute(
  n: Pick<Notification, 'targetType' | 'targetId'>,
  role: UserRole | undefined,
): NotificationRoute | null {
  if (!n.targetId) return null;
  switch (n.targetType) {
    case 'booking':
      return { pathname: '/(modals)/booking-details', params: { booking: n.targetId } };
    // Weekly payouts (PAYOUT_SENT / PAYOUT_FAILED) are withdrawals too.
    case 'withdrawal':
      return { pathname: '/(modals)/withdrawal-details', params: { id: n.targetId } };
    case 'checkout':
      return { pathname: '/(modals)/funds-held', params: { order: n.targetId } };
    case 'invitation':
      return { pathname: '/(modals)/invitation', params: { id: n.targetId } };
    // Clients review applications on their event; ushers see the job itself.
    case 'event':
      return role === 'USHER'
        ? { pathname: '/(modals)/event-details', params: { id: n.targetId } }
        : { pathname: '/(client)/events/[id]', params: { id: n.targetId } };
    // Chat pushes name the booking whose conversation they belong to.
    case 'conversation':
      return { pathname: '/(modals)/message-thread', params: { booking: n.targetId } };
    default:
      return null;
  }
}

const ICON: Record<NotificationType, IconName> = {
  INVITATION_RECEIVED: 'mail',
  BOOKING_CONFIRMED: 'check-circle',
  PAYOUT_RELEASED: 'dollar-sign',
  APPLICATION_RECEIVED: 'bell',
  PAYOUT_SENT: 'send',
  PAYOUT_FAILED: 'alert-triangle',
  DISPUTE_OPENED: 'alert-circle',
  NEW_MESSAGE: 'message-circle',
  CHECKOUT_UPDATED: 'credit-card',
};

export function notificationIcon(type: string): IconName {
  // An app older than the API can meet a kind it does not know yet.
  return ICON[type as NotificationType] ?? 'bell';
}

/** Kinds that report a problem the user should look at, drawn in the danger colour. */
export function notificationIsProblem(type: string): boolean {
  return type === 'PAYOUT_FAILED';
}
