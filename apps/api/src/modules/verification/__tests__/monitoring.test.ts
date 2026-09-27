import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prisma } from '@hq/database';
import { assertDisposableDatabase } from '../../auth/__tests__/assert-disposable-db.js';
import { readSmileHealth } from '../monitoring.js';

const users: string[] = [];
beforeAll(assertDisposableDatabase);
afterAll(async () => { await prisma.user.deleteMany({ where: { id: { in: users } } }); });
it('counts only latest recent Smile attempts, including missing callbacks, without mutating them', async () => {
  const baseline = await readSmileHealth();
  const create = async (hours: number, status: 'PENDING' | 'REJECTED' | 'APPROVED', metadata = {}) => {
    const user = await prisma.user.create({ data: { role: 'USHER', phone: `+234-monitor-${randomUUID()}`, usher: { create: {} } }, include: { usher: true } });
    users.push(user.id);
    const record = await prisma.usherVerification.create({ data: { usherId: user.usher!.id, provider: 'SMILE_ID', method: 'BIOMETRIC', status, govLookup: metadata, createdAt: new Date(Date.now() - hours * 3600_000) } });
    return record;
  };
  await create(2, 'PENDING');
  await create(2, 'PENDING', { providerJobId: 'job_test', providerStatus: 'error' });
  await create(0.1, 'PENDING');
  await create(2, 'REJECTED');
  await create(200, 'PENDING'); // Outside the stated seven-day window.
  const superseded = await create(3, 'PENDING');
  await prisma.usherVerification.create({ data: { usherId: superseded.usherId, provider: 'SMILE_ID', method: 'BIOMETRIC', status: 'APPROVED' } });
  const health = await readSmileHealth();
  expect(health.pending - baseline.pending).toBe(3);
  expect(health.stalled - baseline.stalled).toBe(2);
  expect(health.withoutCallback - baseline.withoutCallback).toBe(1);
  expect(health.providerErrors - baseline.providerErrors).toBe(1);
  expect(health.rejected - baseline.rejected).toBe(1);
  expect(await prisma.usherVerification.findUnique({ where: { id: superseded.id } })).toMatchObject({ status: 'PENDING' });
});
