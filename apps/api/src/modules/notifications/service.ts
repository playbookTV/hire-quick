/**
 * Notification fan-out (TRD §13 catalogue). Best-effort: every notify* helper
 * swallows its own errors so a failed send never breaks the lifecycle action
 * that triggered it. Lifecycle events are persisted to the in-app inbox (a
 * `Notification` row) AND fanned out via email + push (FCM stubbed). Chat
 * (`notifyNewMessage`) and rewards stay delivery-only — chat has its own unread
 * system, and per-message inbox rows would be spam.
 */
import { prisma, type NotificationType } from '@hq/database';
import { formatNaira, type Kobo } from '@hq/shared';
import { sendEmail, recordPush } from './brevo.js';

interface Target {
  targetType?: string;
  targetId?: string;
}

async function deliver(userId: string, title: string, body: string): Promise<void> {
  const [user, tokens] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    prisma.deviceToken.findMany({ where: { userId }, select: { fcmToken: true } }),
  ]);
  if (user?.email) await sendEmail(user.email, title, `<p>${body}</p>`);
  for (const t of tokens) recordPush(t.fcmToken, `${title}: ${body}`);
}

/**
 * Persist an in-app notification row, then deliver out-of-band. The row is the
 * durable record the inbox reads; the deliver step is convenience signalling.
 * `targetType`/`targetId` let the app deep-link to the subject (e.g. an invitation).
 */
async function notify(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  target?: Target,
): Promise<void> {
  await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      body,
      targetType: target?.targetType ?? null,
      targetId: target?.targetId ?? null,
    },
  });
  await deliver(userId, title, body);
}

function safe(p: Promise<void>): void {
  void p.catch(() => undefined);
}

export function notifyInvitationReceived(usherUserId: string, eventTitle: string, invitationId: string): void {
  safe(
    notify(
      usherUserId,
      'INVITATION_RECEIVED',
      'New invitation',
      `You've been invited to "${eventTitle}". Tap to view and respond.`,
      { targetType: 'invitation', targetId: invitationId },
    ),
  );
}

export function notifyBookingConfirmed(usherUserId: string, bookingId?: string): void {
  safe(
    notify(
      usherUserId,
      'BOOKING_CONFIRMED',
      "You've been booked",
      'A client confirmed you for an event. Open HireQuick for details.',
      bookingId ? { targetType: 'booking', targetId: bookingId } : undefined,
    ),
  );
}

export function notifyPayoutReleased(usherUserId: string, amount: Kobo): void {
  safe(notify(usherUserId, 'PAYOUT_RELEASED', 'Payout released', `${formatNaira(amount)} has been added to your wallet.`));
}

export function notifyDisputeOpened(userId: string, bookingId?: string): void {
  safe(
    notify(
      userId,
      'DISPUTE_OPENED',
      'A dispute was opened',
      'A booking you are part of is under review. Escrow is frozen until it resolves.',
      bookingId ? { targetType: 'booking', targetId: bookingId } : undefined,
    ),
  );
}

export function notifyMilestoneUnlocked(usherUserId: string, rewardName: string): void {
  safe(deliver(usherUserId, 'Reward unlocked! 🎉', `You've earned the "${rewardName}" reward for the jobs you've completed.`));
}

export function notifyNewMessage(recipientUserId: string): void {
  // Push-only (per-message email would be spam).
  safe(
    (async () => {
      const tokens = await prisma.deviceToken.findMany({
        where: { userId: recipientUserId },
        select: { fcmToken: true },
      });
      for (const t of tokens) recordPush(t.fcmToken, 'New message on a booking');
    })(),
  );
}
