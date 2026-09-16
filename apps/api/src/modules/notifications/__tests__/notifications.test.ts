import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@hq/database';
import { naira } from '@hq/shared';
import { requestOtp } from '../../auth/otp.js';
import { notifyPayoutReleased } from '../service.js';
import { sentNotifications, clearSentNotifications } from '../brevo.js';

function phone(): string {
  return `+234${randomUUID().replace(/\D/g, '').slice(0, 9).padEnd(9, '0')}`;
}
async function waitFor(cond: () => boolean, ms: number): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
}

const cleanupPhones: string[] = [];
const cleanupUserIds: string[] = [];
afterEach(async () => {
  await prisma.verificationCode.deleteMany({ where: { subjectRef: { in: cleanupPhones } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  cleanupPhones.length = 0;
  cleanupUserIds.length = 0;
  clearSentNotifications();
});

describe('notifications (isolated test transport)', () => {
  it('requestOtp records SMS intent and echoes only in isolated tests', async () => {
    clearSentNotifications();
    const p = phone();
    cleanupPhones.push(p);
    const r = await requestOtp(p);
    expect(r.devCode).toBeTruthy(); // NODE_ENV=test explicitly enables the isolated code echo
    expect(sentNotifications().some((s) => s.kind === 'sms' && s.to === p)).toBe(true);
  });

  it('notifyPayoutReleased emails the usher (best-effort)', async () => {
    clearSentNotifications();
    const email = `usher-${randomUUID().slice(0, 8)}@test.dev`;
    const user = await prisma.user.create({
      data: { role: 'USHER', phone: phone(), email, status: 'ACTIVE' },
    });
    cleanupUserIds.push(user.id);

    notifyPayoutReleased(user.id, naira(17_000));
    await waitFor(() => sentNotifications().some((s) => s.kind === 'email' && s.to === email), 4000);
    expect(sentNotifications().some((s) => s.kind === 'email' && s.to === email)).toBe(true);
  });
});
