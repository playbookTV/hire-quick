/** Chat object authority is limited to one booking, sender and media purpose.
 * This validates namespace ownership, not object existence/upload completion.
 */
import { randomUUID } from 'node:crypto';

export type ChatMediaType = 'IMAGE' | 'VOICE';
export const CHAT_MEDIA_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
] as const;
export type ChatMediaMime = (typeof CHAT_MEDIA_MIME_TYPES)[number];
const FORMATS: Record<ChatMediaMime, { type: ChatMediaType; extension: string }> = {
  'image/jpeg': { type: 'IMAGE', extension: 'jpg' },
  'image/png': { type: 'IMAGE', extension: 'png' },
  'image/webp': { type: 'IMAGE', extension: 'webp' },
  'audio/mp4': { type: 'VOICE', extension: 'm4a' },
  'audio/mpeg': { type: 'VOICE', extension: 'mp3' },
  'audio/ogg': { type: 'VOICE', extension: 'ogg' },
  'audio/wav': { type: 'VOICE', extension: 'wav' },
};
const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const UUID_PATTERN = new RegExp(`^${UUID}$`);
const KEY_PATTERN = new RegExp(
  `^chat/(${UUID})/(${UUID})/(IMAGE|VOICE)/${UUID}\\.(jpg|png|webp|m4a|mp3|ogg|wav)$`,
);

export function chatMediaKey(
  bookingId: string,
  senderId: string,
  type: ChatMediaType,
  mime: ChatMediaMime,
): string {
  const format = FORMATS[mime];
  if (
    bookingId.length !== 36 ||
    !UUID_PATTERN.test(bookingId) ||
    senderId.length !== 36 ||
    !UUID_PATTERN.test(senderId) ||
    format.type !== type
  ) {
    throw new Error('invalid chat media scope or format');
  }
  return `chat/${bookingId}/${senderId}/${type}/${randomUUID()}.${format.extension}`;
}

export function ownsChatMediaKey(
  bookingId: string,
  senderId: string,
  type: string,
  key: string,
): boolean {
  const match = KEY_PATTERN.exec(key);
  if (
    !match ||
    match[0] !== key ||
    match[1] !== bookingId ||
    match[2] !== senderId ||
    match[3] !== type
  )
    return false;
  return Object.values(FORMATS).some(
    (format) => format.type === type && format.extension === match[4],
  );
}

/** Validate stored media again before reading/deleting it, including legacy rows. */
export function authorizedChatMediaKey(
  message: { senderId: string; contentType: string; content: string },
  scope: { bookingId: string; clientUserId: string; usherUserId: string },
): string | null {
  if (message.senderId !== scope.clientUserId && message.senderId !== scope.usherUserId)
    return null;
  return ownsChatMediaKey(scope.bookingId, message.senderId, message.contentType, message.content)
    ? message.content
    : null;
}
