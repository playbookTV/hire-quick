/**
 * Booking-scoped messaging (UXRD §6). Messaging unlocks once a booking is
 * CONFIRMED (post-charge). Shared by the REST routes and the Socket.IO server.
 * Contact-sharing is flagged (non-blocking safety notice, UXRD §6.8).
 */
import { prisma, type MessageContentType } from '@hq/database';
import { ApiError } from '../app.js';
import { notifyNewMessage } from '../modules/notifications/service.js';

const MESSAGEABLE = new Set(['CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'PAID', 'DISPUTED']);

// Phone numbers, emails, or off-platform handles → flag (don't block).
const CONTACT_PATTERNS = [
  /\+?\d[\d\s().-]{6,}\d/, // phone-ish run of digits
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, // email
  /\b(whatsapp|telegram|signal|instagram|snapchat)\b/i,
];

export function flagsContact(text: string): boolean {
  return CONTACT_PATTERNS.some((re) => re.test(text));
}

export async function loadBookingParties(bookingId: string): Promise<{
  clientId: string;
  usherId: string;
  clientUserId: string;
  usherUserId: string;
  status: string;
}> {
  const b = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { event: { include: { client: true } }, usher: true },
  });
  return {
    clientId: b.event.clientId,
    usherId: b.usherId,
    clientUserId: b.event.client.userId,
    usherUserId: b.usher.userId,
    status: b.status,
  };
}

export function isParty(
  parties: { clientUserId: string; usherUserId: string },
  userId: string,
): boolean {
  return parties.clientUserId === userId || parties.usherUserId === userId;
}

export async function assertParty(bookingId: string, userId: string): Promise<void> {
  const p = await loadBookingParties(bookingId);
  if (!isParty(p, userId)) throw new ApiError(403, 'FORBIDDEN', 'not a party to this booking');
}

export interface SentMessage {
  id: string;
  bookingId: string;
  senderId: string;
  contentType: MessageContentType;
  content: string;
  flagged: boolean;
  createdAt: Date;
  recipientUserId: string;
}

export async function sendMessage(params: {
  bookingId: string;
  senderId: string;
  content: string;
  contentType?: MessageContentType;
}): Promise<SentMessage> {
  const p = await loadBookingParties(params.bookingId);
  if (!isParty(p, params.senderId)) throw new ApiError(403, 'FORBIDDEN', 'not a party to this booking');
  if (!MESSAGEABLE.has(p.status)) {
    throw new ApiError(409, 'MESSAGING_LOCKED', 'messaging unlocks once the booking is confirmed');
  }

  const conversation = await prisma.conversation.upsert({
    where: { bookingId: params.bookingId },
    update: {},
    create: { bookingId: params.bookingId, clientId: p.clientId, usherId: p.usherId },
  });

  const contentType: MessageContentType = params.contentType ?? 'TEXT';
  const flagged = contentType === 'TEXT' && flagsContact(params.content);
  const msg = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderId: params.senderId,
      contentType,
      content: params.content,
      flagged,
    },
  });

  const recipientUserId = params.senderId === p.clientUserId ? p.usherUserId : p.clientUserId;
  notifyNewMessage(recipientUserId);

  return {
    id: msg.id,
    bookingId: params.bookingId,
    senderId: params.senderId,
    contentType,
    content: params.content,
    flagged,
    createdAt: msg.createdAt,
    recipientUserId,
  };
}

export async function listMessages(bookingId: string, userId: string) {
  await assertParty(bookingId, userId);
  const conversation = await prisma.conversation.findUnique({ where: { bookingId } });
  if (!conversation) return [];
  return prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Mark the counterparty's messages as seen (read receipts, UXRD §6). Marks every
 * unseen inbound message, or only those up to `upToMessageId` when given. Returns
 * how many rows were updated. `seenAt` already exists on Message — no migration.
 */
export async function markSeen(bookingId: string, userId: string, upToMessageId?: string): Promise<number> {
  await assertParty(bookingId, userId);
  const conversation = await prisma.conversation.findUnique({ where: { bookingId } });
  if (!conversation) return 0;

  let createdAtCeil: Date | undefined;
  if (upToMessageId) {
    const m = await prisma.message.findUnique({ where: { id: upToMessageId } });
    if (m && m.conversationId === conversation.id) createdAtCeil = m.createdAt;
  }

  const res = await prisma.message.updateMany({
    where: {
      conversationId: conversation.id,
      senderId: { not: userId },
      seenAt: null,
      ...(createdAtCeil ? { createdAt: { lte: createdAtCeil } } : {}),
    },
    data: { seenAt: new Date() },
  });
  return res.count;
}

/** Count unseen inbound messages for a user on a booking (inbox badge). */
export async function unreadCount(bookingId: string, userId: string): Promise<number> {
  await assertParty(bookingId, userId);
  const conversation = await prisma.conversation.findUnique({ where: { bookingId } });
  if (!conversation) return 0;
  return prisma.message.count({
    where: { conversationId: conversation.id, senderId: { not: userId }, seenAt: null },
  });
}
