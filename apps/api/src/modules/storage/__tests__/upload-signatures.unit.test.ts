import { describe, expect, it } from 'vitest';
import { matchesSignature } from '../uploads.js';

describe('upload content signature screening', () => {
  it.each([
    ['image/jpeg', Buffer.from([255, 216, 255])],
    ['image/jpg', Buffer.from([255, 216, 255])],
    ['image/png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
    ['image/webp', Buffer.from('RIFF0000WEBP')],
    ['image/heic', Buffer.from('0000ftypheic')],
    ['image/heif', Buffer.from('0000ftypmif1')],
    ['application/pdf', Buffer.from('%PDF-1.7')],
    ['audio/mp4', Buffer.from('0000ftypM4A ')],
    ['audio/mpeg', Buffer.from('ID3')],
    ['audio/ogg', Buffer.from('OggS')],
    ['audio/wav', Buffer.from('RIFF0000WAVE')],
  ] as const)('allows a %s signature, rejecting HTML and empty bytes', (mime, data) => {
    expect(matchesSignature(mime, data)).toBe(true);
    expect(matchesSignature(mime, Buffer.from('<html>bad</html>'))).toBe(false);
    expect(matchesSignature(mime, new Uint8Array())).toBe(false);
  });
  it('rejects SVG and mismatched container formats', () => {
    expect(matchesSignature('image/svg+xml', Buffer.from('<svg/>'))).toBe(false);
    expect(matchesSignature('image/webp', Buffer.from('RIFF0000WAVE'))).toBe(false);
    expect(matchesSignature('image/heic', Buffer.from('0000ftypmp42'))).toBe(false);
  });
});
