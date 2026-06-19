/**
 * Notification fan-out (TRD §13 catalogue). Best-effort: every notify* helper
 * swallows its own errors so a failed send never breaks the lifecycle action
 * that triggered it. Email via Brevo; push via FCM (stubbed).
 */
import { prisma } from '@hq/database';
import { formatNaira, type Kobo } from '@hq/shared';
import { sendEmail, recordPush } from './brevo.js';

async function deliver(userId: string, title: string, body: string): Promise<void> {
  const [user, tokens] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    prisma.deviceToken.findMany({ where: { userId }, select: { fcmToken: true } }),
  ]);
  if (user?.email) await sendEmail(user.email, title, `<p>${body}</p>`);
  for (const t of tokens) recordPush(t.fcmToken, `${title}: ${body}`);
}

function safe(p: Promise<void>): void {
  void p.catch(() => undefined);
}

export function notifyBookingConfirmed(usherUserId: string): void {
  safe(deliver(usherUserId, "You've been booked", 'A client confirmed you for an event. Open HireQuick for details.'));
}

export function notifyPayoutReleased(usherUserId: string, amount: Kobo): void {
  safe(deliver(usherUserId, 'Payout released', `${formatNaira(amount)} has been added to your wallet.`));
}

export function notifyDisputeOpened(userId: string): void {
  safe(deliver(userId, 'A dispute was opened', 'A booking you are part of is under review. Escrow is frozen until it resolves.'));
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
