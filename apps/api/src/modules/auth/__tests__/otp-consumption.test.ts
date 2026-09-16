/** Database concurrency and rollback tests: only run in disposable storage. */
import { createHash, randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@hq/database';
import { requestOtp, verifyOtp } from '../otp.js';
import { hashOtp, OTP_TTL_MS } from '../hash.js';
import { generateCheckin, verifyCheckin } from '../../bookings/service.js';
import { assertDisposableDatabase } from './assert-disposable-db.js';

const phones: string[] = [];
const eventIds: string[] = [];
const bookingIds: string[] = [];
let validated = false;
beforeAll(async () => {
  await assertDisposableDatabase();
  validated = true;
});
afterEach(async () => {
  if (!validated) return;
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS otp_test_reject_audit ON audit_logs');
  await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS otp_test_reject_audit()');
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS otp_test_reject_checkin ON bookings');
  await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS otp_test_reject_checkin()');
  await prisma.verificationCode.deleteMany({
    where: { subjectRef: { in: [...phones, ...bookingIds] } },
  });
  await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
  await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
  await prisma.user.deleteMany({ where: { phone: { in: phones } } });
  phones.length = 0;
  eventIds.length = 0;
  bookingIds.length = 0;
  // Audit records stay append-only; parent disposable-schema teardown owns them.
});
function phone(): string {
  const value = `otp-test-${randomUUID()}`;
  phones.push(value);
  return value;
}
function wrong(code: string): string {
  return code === '000000' ? '000001' : '000000';
}
async function authCode() {
  const subject = phone();
  const issued = await requestOtp(subject);
  expect(issued.devCode).toMatch(/^\d{6}$/);
  const rec = await prisma.verificationCode.findFirstOrThrow({ where: { subjectRef: subject } });
  return { phone: subject, code: issued.devCode!, rec };
}
async function bookingFixture() {
  const clientUser = await prisma.user.create({
    data: {
      phone: phone(),
      role: 'CLIENT',
      status: 'ACTIVE',
      client: { create: { displayName: 'OTP fixture' } },
    },
    include: { client: true },
  });
  const usherUser = await prisma.user.create({
    data: {
      phone: phone(),
      role: 'USHER',
      status: 'ACTIVE',
      usher: { create: {} },
    },
    include: { usher: true },
  });
  const event = await prisma.event.create({
    data: {
      clientId: clientUser.client!.id,
      title: 'OTP fixture',
      venue: 'Lagos',
      eventDate: new Date('2026-09-20'),
      startTime: '10:00',
      endTime: '16:00',
      category: 'Gala',
      headcount: 1,
      budgetPerHead: 10000,
    },
  });
  eventIds.push(event.id);
  const booking = await prisma.booking.create({
    data: {
      eventId: event.id,
      usherId: usherUser.usher!.id,
      amount: 10000,
      status: 'CONFIRMED',
    },
  });
  bookingIds.push(booking.id);
  const { code } = await generateCheckin(booking.id, clientUser.id);
  const rec = await prisma.verificationCode.findFirstOrThrow({ where: { subjectRef: booking.id } });
  return { bookingId: booking.id, clientId: clientUser.id, usherId: usherUser.id, code, rec };
}

describe('atomic login OTP consumption', () => {
  it('allows one concurrent successful login and creates one user', async () => {
    const f = await authCode();
    const results = await Promise.allSettled([
      verifyOtp(f.phone, f.code),
      verifyOtp(f.phone, f.code),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.user.count({ where: { phone: f.phone } })).toBe(1);
    expect(
      (await prisma.verificationCode.findUniqueOrThrow({ where: { id: f.rec.id } })).consumedAt,
    ).not.toBeNull();
  });
  it('caps concurrent incorrect guesses at five and rejects the correct code afterward', async () => {
    const f = await authCode();
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => verifyOtp(f.phone, wrong(f.code))),
    );
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(
      (await prisma.verificationCode.findUniqueOrThrow({ where: { id: f.rec.id } })).attempts,
    ).toBe(5);
    await expect(verifyOtp(f.phone, f.code)).rejects.toMatchObject({ code: 'OTP_LOCKED' });
    expect(
      await prisma.auditLog.count({ where: { action: 'auth.otp.locked', target: f.phone } }),
    ).toBe(1);
  });
  it('serializes concurrent issuance at the hourly limit and keeps only one active code', async () => {
    const subject = phone();
    const results = await Promise.allSettled(Array.from({ length: 7 }, () => requestOtp(subject)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
    expect(
      await prisma.verificationCode.count({ where: { purpose: 'AUTH', subjectRef: subject } }),
    ).toBe(5);
    expect(
      await prisma.verificationCode.count({
        where: { subjectRef: subject, expiresAt: { gt: new Date() } },
      }),
    ).toBe(1);
  });
  it('rolls back consumption and user activation when the login audit fails, then permits retry', async () => {
    const f = await authCode();
    const user = await prisma.user.create({
      data: { phone: f.phone, role: 'CLIENT', status: 'PENDING' },
    });
    await prisma.$executeRawUnsafe(
      "CREATE FUNCTION otp_test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected audit failure'; END $$",
    );
    await prisma.$executeRawUnsafe(
      'CREATE TRIGGER otp_test_reject_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION otp_test_reject_audit()',
    );
    await expect(verifyOtp(f.phone, f.code)).rejects.toThrow();
    expect(
      (await prisma.verificationCode.findUniqueOrThrow({ where: { id: f.rec.id } })).consumedAt,
    ).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe(
      'PENDING',
    );
    await prisma.$executeRawUnsafe('DROP TRIGGER otp_test_reject_audit ON audit_logs');
    await expect(verifyOtp(f.phone, f.code)).resolves.toMatchObject({ user: { id: user.id } });
  });
  it.each(['expired', 'over-age', 'legacy', 'removed-key', 'other-session'] as const)(
    'rejects %s verifiers',
    async (kind) => {
      const f = await authCode();
      const binding = { purpose: 'AUTH' as const, subjectRef: f.phone, id: f.rec.id };
      await prisma.verificationCode.update({
        where: { id: f.rec.id },
        data: {
          ...(kind === 'expired' ? { expiresAt: new Date(Date.now() - 1) } : {}),
          ...(kind === 'over-age'
            ? {
                createdAt: new Date(Date.now() - OTP_TTL_MS - 1000),
                expiresAt: new Date(Date.now() + 3_600_000),
              }
            : {}),
          ...(kind === 'legacy'
            ? { codeHash: createHash('sha256').update(f.code).digest('hex') }
            : {}),
          ...(kind === 'removed-key'
            ? {
                codeHash: hashOtp(f.code, binding, {
                  current: { id: 'removed', secret: 'x'.repeat(32) },
                }),
              }
            : {}),
          ...(kind === 'other-session'
            ? { codeHash: hashOtp(f.code, { ...binding, id: randomUUID() }) }
            : {}),
        },
      });
      await expect(verifyOtp(f.phone, f.code)).rejects.toMatchObject({ code: 'OTP_INVALID' });
      expect(await prisma.user.count({ where: { phone: f.phone } })).toBe(0);
    },
  );
});

describe('atomic attendance code consumption', () => {
  it('allows one concurrent check-in and consumes exactly once', async () => {
    const f = await bookingFixture();
    const results = await Promise.allSettled([
      verifyCheckin(f.bookingId, f.usherId, f.code),
      verifyCheckin(f.bookingId, f.usherId, f.code),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: f.bookingId } })).status).toBe(
      'CHECKED_IN',
    );
    expect(
      (await prisma.verificationCode.findUniqueOrThrow({ where: { id: f.rec.id } })).consumedAt,
    ).not.toBeNull();
  });
  it('persists at most five guesses under concurrency, then allows a newly generated code', async () => {
    const f = await bookingFixture();
    await Promise.allSettled(
      Array.from({ length: 8 }, () => verifyCheckin(f.bookingId, f.usherId, wrong(f.code))),
    );
    const rec = await prisma.verificationCode.findUniqueOrThrow({ where: { id: f.rec.id } });
    expect(rec.attempts).toBe(5);
    expect(rec.consumedAt).toBeNull();
    await expect(verifyCheckin(f.bookingId, f.usherId, f.code)).rejects.toMatchObject({
      code: 'CODE_LOCKED',
    });
    const replacement = await generateCheckin(f.bookingId, f.clientId);
    await expect(verifyCheckin(f.bookingId, f.usherId, replacement.code)).resolves.toBeUndefined();
  });
  it('rolls back consumption on a check-in DB failure and accepts retry', async () => {
    const f = await bookingFixture();
    await prisma.$executeRawUnsafe(
      "CREATE FUNCTION otp_test_reject_checkin() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status = 'CHECKED_IN' THEN RAISE EXCEPTION 'injected check-in failure'; END IF; RETURN NEW; END $$",
    );
    await prisma.$executeRawUnsafe(
      'CREATE TRIGGER otp_test_reject_checkin BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION otp_test_reject_checkin()',
    );
    await expect(verifyCheckin(f.bookingId, f.usherId, f.code)).rejects.toThrow();
    expect(
      (await prisma.verificationCode.findUniqueOrThrow({ where: { id: f.rec.id } })).consumedAt,
    ).toBeNull();
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: f.bookingId } })).status).toBe(
      'CONFIRMED',
    );
    await prisma.$executeRawUnsafe('DROP TRIGGER otp_test_reject_checkin ON bookings');
    await expect(verifyCheckin(f.bookingId, f.usherId, f.code)).resolves.toBeUndefined();
  });
  it('serializes generation so concurrent replacements leave only one active record', async () => {
    const f = await bookingFixture();
    await Promise.all([
      generateCheckin(f.bookingId, f.clientId),
      generateCheckin(f.bookingId, f.clientId),
    ]);
    const active = await prisma.verificationCode.findMany({
      where: { subjectRef: f.bookingId, expiresAt: { gt: new Date() } },
    });
    expect(active).toHaveLength(1);
    expect(active[0]!.expiresAt.getTime() - active[0]!.createdAt.getTime()).toBe(OTP_TTL_MS);
    expect(
      (
        await prisma.verificationCode.findUniqueOrThrow({ where: { id: f.rec.id } })
      ).expiresAt.getTime(),
    ).toBeLessThanOrEqual(Date.now());
  });
  it('rejects expired and over-age records even if a legacy expiry is still in the future', async () => {
    const f = await bookingFixture();
    await prisma.verificationCode.update({
      where: { id: f.rec.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await expect(verifyCheckin(f.bookingId, f.usherId, f.code)).rejects.toMatchObject({
      code: 'CODE_INVALID',
    });
    await prisma.verificationCode.update({
      where: { id: f.rec.id },
      data: {
        createdAt: new Date(Date.now() - OTP_TTL_MS - 1),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    await expect(verifyCheckin(f.bookingId, f.usherId, f.code)).rejects.toMatchObject({
      code: 'CODE_INVALID',
    });
  });
  it('rejects non-owner generation/verification without spending an attempt', async () => {
    const f = await bookingFixture();
    await expect(generateCheckin(f.bookingId, f.usherId)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(verifyCheckin(f.bookingId, f.clientId, f.code)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(
      (await prisma.verificationCode.findUniqueOrThrow({ where: { id: f.rec.id } })).attempts,
    ).toBe(0);
  });
});
