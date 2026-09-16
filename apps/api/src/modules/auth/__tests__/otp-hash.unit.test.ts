import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashOtp, verifyOtpHash, type OtpBinding, type OtpKeyring } from '../hash.js';

const binding: OtpBinding = { purpose: 'AUTH', subjectRef: '+2348000000000', id: 'session-one' };
const old = { id: 'old', secret: 'a'.repeat(32) };
const current = { id: 'current', secret: 'b'.repeat(32) };
const ring: OtpKeyring = { current, previous: old };
const code = '123456';

describe('session-bound OTP verifier', () => {
  it('stores a versioned verifier and accepts its six-digit code', () => {
    const stored = hashOtp(code, binding, ring);
    expect(stored).toMatch(/^v1:current:[a-f0-9]{64}$/);
    expect(verifyOtpHash(stored, code, binding, ring)).toBe(true);
    expect(verifyOtpHash(stored, '123457', binding, ring)).toBe(false);
  });
  it.each<OtpBinding>([
    { ...binding, purpose: 'ATTENDANCE' },
    { ...binding, subjectRef: '+2348000000001' },
    { ...binding, id: 'session-two' },
  ])('rejects transplanted verifiers: %j', (other) => {
    expect(verifyOtpHash(hashOtp(code, binding, ring), code, other, ring)).toBe(false);
  });
  it('accepts a previous key during rotation but never writes with it', () => {
    const stored = hashOtp(code, binding, { current: old });
    expect(verifyOtpHash(stored, code, binding, ring)).toBe(true);
    expect(hashOtp(code, binding, ring)).toContain('v1:current:');
    expect(verifyOtpHash(stored, code, binding, { current })).toBe(false);
  });
  it('rejects wrong secret material even with the same key ID', () => {
    expect(
      verifyOtpHash(hashOtp(code, binding, ring), code, binding, {
        current: { ...current, secret: 'c'.repeat(32) },
      }),
    ).toBe(false);
  });
  it.each([
    createHash('sha256').update(code).digest('hex'),
    'v2:current:' + 'a'.repeat(64),
    'v1:current:1234',
    'v1:missing:' + 'a'.repeat(64),
    'v1:current:' + 'z'.repeat(64),
  ])('rejects legacy, malformed, and unknown-key records', (stored) => {
    expect(verifyOtpHash(stored, code, binding, ring)).toBe(false);
  });
  it.each(['12345', '1234567', '12x456', '１２３４５６'])(
    'requires exactly six ASCII digits',
    (input) => {
      expect(verifyOtpHash(hashOtp(input, binding, ring), input, binding, ring)).toBe(false);
    },
  );
});
