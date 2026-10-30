/**
 * Notification fan-out (TRD §13 catalogue). Best-effort: every notify* helper
 * swallows its own errors so a failed send never breaks the lifecycle action
 * that triggered it. Lifecycle events are persisted to the in-app inbox (a
 * `Notification` row) AND fanned out via email + push (Expo). Chat
 * (`notifyNewMessage`) and rewards stay delivery-only — chat has its own unread
 * system, and per-message inbox rows would be spam.
 */
import { randomUUID } from 'node:crypto';
import { prisma, type NotificationType } from '@hq/database';
import { CHANNEL_PREFERENCE, formatNaira, type Kobo } from '@hq/shared';
import { sendEmail } from './brevo.js';
import { sendPush, type PushMessage } from './push.js';

interface Target {
  targetType: string;
  targetId: string;
}

/** Push presentation for a notification; the inbox row keeps the full text. */
type PushOptions = Partial<Pick<PushMessage, 'channel' | 'categoryId' | 'collapseId' | 'timeSensitive'>> & {
  /** Lock-screen text when the inbox body names client-written text or other private detail. */
  body?: string;
  /** Sends sharing a key happen at most once (retried jobs, scheduled reminders). */
  dedupeKey?: string;
};

async function deliver(
  userId: string,
  type: string,
  title: string,
  body: string,
  target?: Target,
  push: PushOptions = {},
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (user?.email) await sendEmail(user.email, title, `<p>${body}</p>`);
  const { body: pushBody, dedupeKey, ...presentation } = push;
  await deliverPush(
    userId,
    { type, title, body: pushBody ?? body, channel: 'bookings', ...presentation, ...(target ? { target } : {}) },
    dedupeKey,
  );
}

/**
 * Every push honors the same explicit permission, then the channel's category
 * switch. One dispatch row per user per push makes keyed sends idempotent and
 * lets the app report which notification was opened.
 */
export async function deliverPush(userId: string, message: PushMessage, dedupeKey?: string): Promise<void> {
  // Device registration does not grant permission. Only an explicit grant
  // permits push, including for legacy tokens without a consent record.
  await prisma.$transaction(async (tx) => {
    const [user] = await tx.$queryRaw<{ status: string }[]>`
      SELECT status::text AS status FROM users WHERE id = ${userId}::uuid FOR SHARE`;
    // Suspended, pending and erased accounts cannot sign in, so nothing is sent to them.
    if (user?.status !== 'ACTIVE') return;
    const consent = await tx.consentRecord.findUnique({
      where: { userId_purpose: { userId, purpose: 'PUSH_NOTIFICATIONS' } },
      select: { granted: true },
    });
    if (consent?.granted !== true) return;
    const preference = CHANNEL_PREFERENCE[message.channel];
    if (preference) {
      const preferences = await tx.notificationPreference.findUnique({ where: { userId } });
      if (preferences && !preferences[preference]) return;
    }
    const devices = await tx.deviceToken.findMany({ where: { userId }, select: { id: true, token: true } });
    if (devices.length === 0) return;
    const dispatchId = randomUUID();
    const inserted = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO notification_dispatches ("id", "userId", "kind", "dedupeKey", "targetType", "targetId")
      VALUES (${dispatchId}::uuid, ${userId}::uuid, ${message.type}, ${dedupeKey ?? null},
              ${message.target?.targetType ?? null}, ${message.target?.targetId ?? null})
      ON CONFLICT ("dedupeKey") DO NOTHING
      RETURNING id`;
    if (inserted.length === 0) return;
    // Only scheduling the transport happens under the lock; no provider request
    // is awaited. A withdrawal prevents subsequent dispatch, not in-flight sends.
    sendPush(devices, message, dispatchId);
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
  push?: PushOptions,
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
  await deliver(userId, type, title, body, target, push);
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
      // Event titles are client-written and can name the venue; keep them off the lock screen.
      { categoryId: 'invitation', body: "You've been invited to a job. Tap to view and respond." },
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

export function notifyPayoutSent(usherUserId: string, amount: Kobo, withdrawalId: string): void {
  safe(
    notify(usherUserId, 'PAYOUT_SENT', 'Payout sent', `${formatNaira(amount)} has been sent to your bank account.`, {
      targetType: 'withdrawal',
      targetId: withdrawalId,
    }),
  );
}

export function notifyPayoutFailed(usherUserId: string, amount: Kobo, withdrawalId: string): void {
  safe(
    notify(
      usherUserId,
      'PAYOUT_FAILED',
      'Payout could not be sent',
      `${formatNaira(amount)} is back in your wallet and will be included in the next weekly payout. Check your payout account details.`,
      { targetType: 'withdrawal', targetId: withdrawalId },
    ),
  );
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
  safe(
    deliver(
      usherUserId,
      'MILESTONE_UNLOCKED',
      'Reward unlocked! 🎉',
      `You've earned the "${rewardName}" reward for the jobs you've completed.`,
    ),
  );
}

export function notifyNewMessage(recipientUserId: string, bookingId: string): void {
  // Push-only (per-message email would be spam); one notification per conversation.
  safe(
    deliverPush(recipientUserId, {
      type: 'NEW_MESSAGE',
      title: 'New message',
      body: 'You have a new message on a booking.',
      channel: 'messages',
      target: { targetType: 'conversation', targetId: bookingId },
      collapseId: `chat:${bookingId}`,
    }),
  );
}
