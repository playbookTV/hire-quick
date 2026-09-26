/**
 * Booking-scoped messaging (UXRD §6). Messaging unlocks once a booking is
 * CONFIRMED (post-charge). Shared by the REST routes and the Socket.IO server.
 * Contact-sharing is flagged (non-blocking safety notice, UXRD §6.8).
 */
import { randomUUID } from 'node:crypto';
import { consumeUpload, lockUploadOwner, STORAGE_TX } from '../modules/storage/uploads.js';
import { prisma, Prisma, type MessageContentType } from '@hq/database';
import { ApiError } from '../app.js';
import { ownsChatMediaKey, authorizedChatMediaKey } from '../modules/storage/chat-media.js';
import { notifyNewMessage } from '../modules/notifications/service.js';
import { serviceMessageInput, seenMessageInput, messagePageInput } from './validation.js';

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

export async function assertMessageableParty(bookingId: string, userId: string) {
  const parties = await loadBookingParties(bookingId);
  if (!isParty(parties, userId))
    throw new ApiError(403, 'FORBIDDEN', 'not a party to this booking');
  if (!MESSAGEABLE.has(parties.status)) {
    throw new ApiError(409, 'MESSAGING_LOCKED', 'messaging unlocks once the booking is confirmed');
  }
  return parties;
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
  clientMessageId?: string;
  bookingId: string;
  senderId: string;
  content: string;
  contentType?: MessageContentType;
}): Promise<SentMessage> {
  const input = serviceMessageInput.parse(params);
  const p = await assertMessageableParty(input.bookingId, input.senderId);
  const contentType: MessageContentType = input.contentType ?? 'TEXT';
  if (
    contentType !== 'TEXT' &&
    !ownsChatMediaKey(input.bookingId, input.senderId, contentType, input.content)
  ) {
    throw new ApiError(400, 'INVALID_MEDIA_KEY', 'media must belong to this sender and booking');
  }

  const conversation = await prisma.conversation.upsert({
    where: { bookingId: input.bookingId },
    update: {},
    create: { bookingId: input.bookingId, clientId: p.clientId, usherId: p.usherId },
  });

  const flagged = contentType === 'TEXT' && flagsContact(input.content);
  let msg;
  let inserted = false;
  try {
    msg = await prisma.$transaction(async (tx) => {
      await lockUploadOwner(tx, input.senderId);
      // Serialize appends so a later commit cannot fall behind a client's cursor,
      // including messages sent in the same millisecond on different API hosts.
      await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${conversation.id}::uuid FOR UPDATE`;
      const last = await tx.message.findFirst({
        where: { conversationId: conversation.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { createdAt: true },
      });
      const id = input.clientMessageId ?? randomUUID();
      if (contentType !== 'TEXT')
        await consumeUpload(tx, {
          key: input.content,
          ownerId: input.senderId,
          scopeId: input.bookingId,
          purpose: contentType,
          reference: `message:${id}`,
        });
      return tx.message.create({
        data: {
          id,
          createdAt: new Date(Math.max(Date.now(), (last?.createdAt.getTime() ?? 0) + 1)),
          conversationId: conversation.id,
          senderId: input.senderId,
          contentType,
          content: input.content,
          flagged,
        },
      });
    }, STORAGE_TX);
    inserted = true;
  } catch (error) {
    if (
      !input.clientMessageId ||
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    )
      throw error;
    const existing = await prisma.message.findUnique({ where: { id: input.clientMessageId } });
    if (
      !existing ||
      existing.conversationId !== conversation.id ||
      existing.senderId !== input.senderId ||
      existing.content !== input.content ||
      existing.contentType !== contentType
    ) {
      throw new ApiError(409, 'MESSAGE_ID_CONFLICT', 'This message ID was already used.');
    }
    msg = existing;
  }

  const recipientUserId = input.senderId === p.clientUserId ? p.usherUserId : p.clientUserId;
  if (inserted) notifyNewMessage(recipientUserId);

  return {
    ...msg,
    bookingId: input.bookingId,
    senderId: input.senderId,
    contentType,
    content: input.content,
    flagged,
    createdAt: msg.createdAt,
    recipientUserId,
  };
}

export async function listMessages(bookingId: string, userId: string) {
  // Retain the array contract for older app builds, but bound its response.
  return (await listMessagePage(bookingId, userId, { limit: 100 })).items;
}

/** Cursor IDs are resolved within the authorized conversation. Prisma uses the
 * stored timestamp (including PostgreSQL microseconds) plus ID for stable ties. */
export async function listMessagePage(bookingId: string, userId: string, query: unknown) {
  const input = messagePageInput.parse(query);
  const parties = await loadBookingParties(bookingId);
  if (!isParty(parties, userId))
    throw new ApiError(403, 'FORBIDDEN', 'not a party to this booking');
  const conversation = await prisma.conversation.findUnique({ where: { bookingId } });
  if (!conversation)
    return { items: [], hasMore: false, oldestCursor: null, newestCursor: null, receipts: [] };
  const cursor = input.before ?? input.after;
  if (
    cursor &&
    !(await prisma.message.findFirst({
      where: { id: cursor, conversationId: conversation.id },
      select: { id: true },
    }))
  ) {
    throw new ApiError(400, 'INVALID_MESSAGE_CURSOR', 'Reload this conversation to continue.');
  }
  const order = input.after ? 'asc' : 'desc';
  const messages = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: [{ createdAt: order }, { id: order }],
    take: input.limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = messages.length > input.limit;
  const page = messages.slice(0, input.limit);
  if (!input.after) page.reverse();
  const receipts = input.receiptIds?.length
    ? await prisma.message.findMany({
        where: {
          conversationId: conversation.id,
          senderId: userId,
          id: { in: input.receiptIds },
          seenAt: { not: null },
        },
        select: { id: true, seenAt: true },
      })
    : [];
  // Legacy arbitrary media references cannot become usable through history.
  const items = page.map((message) =>
    message.contentType === 'TEXT' || authorizedChatMediaKey(message, { bookingId, ...parties })
      ? message
      : { ...message, content: '' },
  );
  return {
    items,
    hasMore,
    oldestCursor: page[0]?.id ?? null,
    newestCursor: page.at(-1)?.id ?? null,
    receipts,
  };
}

/**
 * Mark the counterparty's messages as seen (read receipts, UXRD §6). Marks every
 * unseen inbound message, or only those up to `upToMessageId` when given. Returns
 * how many rows were updated. `seenAt` already exists on Message — no migration.
 */
export async function markSeen(
  bookingId: string,
  userId: string,
  upToMessageId?: string,
): Promise<number> {
  seenMessageInput.parse({ bookingId, ...(upToMessageId === undefined ? {} : { upToMessageId }) });
  await assertParty(bookingId, userId);
  const conversation = await prisma.conversation.findUnique({ where: { bookingId } });
  if (!conversation) return 0;

  if (upToMessageId) {
    const m = await prisma.message.findUnique({ where: { id: upToMessageId } });
    if (!m || m.conversationId !== conversation.id)
      throw new ApiError(
        400,
        'INVALID_MESSAGE_CURSOR',
        'Message does not belong to this conversation.',
      );
    // Compare in PostgreSQL to retain microsecond precision for legacy rows and
    // use the same ID tie-breaker as history pagination.
    return prisma.$executeRaw`
      UPDATE messages SET "seenAt" = now()
      WHERE "conversationId" = ${conversation.id}::uuid
        AND "senderId" <> ${userId}::uuid AND "seenAt" IS NULL
        AND ("createdAt", id) <= (
          SELECT "createdAt", id FROM messages WHERE id = ${upToMessageId}::uuid
            AND "conversationId" = ${conversation.id}::uuid
        )`;
  }

  const res = await prisma.message.updateMany({
    where: {
      conversationId: conversation.id,
      senderId: { not: userId },
      seenAt: null,
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
