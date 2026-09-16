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
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (user?.email) await sendEmail(user.email, title, `<p>${body}</p>`);
  await deliverPush(userId, `${title}: ${body}`);
}

/** Both chat and lifecycle pushes honor the same explicit permission. */
export async function deliverPush(userId: string, summary: string): Promise<void> {
  // Device registration does not grant permission. Only an explicit grant
  // permits push, including for legacy tokens without a consent record.
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR SHARE`;
    const consent = await tx.consentRecord.findUnique({
      where: { userId_purpose: { userId, purpose: 'PUSH_NOTIFICATIONS' } },
      select: { granted: true },
    });
    if (consent?.granted !== true) return;
    const tokens = await tx.deviceToken.findMany({ where: { userId }, select: { fcmToken: true } });
    // Only scheduling the transport happens under the lock; no provider request
    // is awaited. A withdrawal prevents subsequent dispatch, not in-flight sends.
    for (const token of tokens) recordPush(token.fcmToken, summary);
  }, { timeout: 30_000, maxWait: 30_000 });
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

export function notifyApplicationReceived(clientUserId: string, eventTitle: string, eventId: string, usherName?: string): void {
  const who = usherName ?? 'An usher';
  safe(
    notify(
      clientUserId,
      'APPLICATION_RECEIVED',
      'New application',
      `${who} applied to "${eventTitle}". Tap to review applications.`,
      { targetType: 'event', targetId: eventId },
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
      'A booking you are part of is under review. Funds stay safely on hold until it resolves.',
      bookingId ? { targetType: 'booking', targetId: bookingId } : undefined,
    ),
  );
}

export function notifyMilestoneUnlocked(usherUserId: string, rewardName: string): void {
  safe(deliver(usherUserId, 'Reward unlocked! 🎉', `You've earned the "${rewardName}" reward for the jobs you've completed.`));
}

export function notifyNewMessage(recipientUserId: string): void {
  // Push-only (per-message email would be spam).
  safe(deliverPush(recipientUserId, 'New message on a booking'));
}
