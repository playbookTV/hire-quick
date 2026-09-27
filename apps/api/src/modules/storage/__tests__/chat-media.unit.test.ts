import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  authorizedChatMediaKey,
  chatMediaKey,
  ownsChatMediaKey,
  CHAT_MEDIA_MIME_TYPES,
} from '../chat-media.js';

const booking = randomUUID();
const sender = randomUUID();
const scope = { bookingId: booking, clientUserId: sender, usherUserId: randomUUID() };
const image = chatMediaKey(booking, sender, 'IMAGE', 'image/jpeg');

describe('chat media namespace authorization', () => {
  it.each(CHAT_MEDIA_MIME_TYPES)('binds %s to sender, booking and purpose', (mime) => {
    const type = mime.startsWith('image/') ? 'IMAGE' : 'VOICE';
    const key = chatMediaKey(booking, sender, type, mime);
    expect(ownsChatMediaKey(booking, sender, type, key)).toBe(true);
    expect(
      authorizedChatMediaKey({ senderId: sender, contentType: type, content: key }, scope),
    ).toBe(key);
  });
  it.each([
    `verifications/${sender}/id-${randomUUID()}.jpg`,
    `photos/${sender}/avatar-${randomUUID()}.jpg`,
    `https://bucket.example/${image}`,
    `${image}?signature=known`,
    `${image}#fragment`,
    `${image}/extra`,
    `${image}\n`,
    image.replace('/IMAGE/', '/VOICE/'),
    image.replace('.jpg', '.m4a'),
    image.replace('/IMAGE/', '/../IMAGE/'),
    image.replace('/IMAGE/', '/%49MAGE/'),
    image.replace('/IMAGE/', '/IMAGE\\'),
    image.replace(sender, randomUUID()),
    image.replace(booking, randomUUID()),
    image.toUpperCase(),
    image.replace('chat/', '/chat/'),
    image.replace('chat/', 'chat//'),
  ])('rejects unrelated or noncanonical references', (key) => {
    expect(ownsChatMediaKey(booking, sender, 'IMAGE', key)).toBe(false);
  });
  it('requires the stored sender to be a real conversation party too', () => {
    const stranger = randomUUID();
    const key = chatMediaKey(booking, stranger, 'IMAGE', 'image/png');
    expect(
      authorizedChatMediaKey({ senderId: stranger, contentType: 'IMAGE', content: key }, scope),
    ).toBeNull();
  });
  it('does not let a counterparty reuse the other sender’s key', () => {
    expect(
      authorizedChatMediaKey(
        { senderId: scope.usherUserId, contentType: 'IMAGE', content: image },
        scope,
      ),
    ).toBeNull();
  });
  it('rejects media type/extension mismatch when issuing', () => {
    expect(() => chatMediaKey(booking, sender, 'VOICE', 'image/png')).toThrow();
  });
  it.each([booking + '\n', booking.toUpperCase(), '../' + booking, 'not-a-uuid'])(
    'rejects noncanonical issuance scope',
    (id) => {
      expect(() => chatMediaKey(id, sender, 'IMAGE', 'image/png')).toThrow();
    },
  );
});
