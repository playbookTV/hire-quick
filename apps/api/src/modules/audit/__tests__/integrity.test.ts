import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma, type Prisma } from '@hq/database';
import { verifyAuditChain, writeAudit } from '../../audit.js';
import { assertDisposableDatabase } from '../../auth/__tests__/assert-disposable-db.js';

let validated = false;
beforeAll(async () => {
  await assertDisposableDatabase();
  validated = true;
});

/** Every destructive fixture is rolled back, including failed assertions. */
async function isolatedHistory(
  test: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  if (!validated) throw new Error('Disposable database guard did not pass');
  const rollback = new Error('rollback isolated audit fixture');
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.auditLog.deleteMany();
        await tx.auditChainHead.deleteMany();
        await test(tx);
        throw rollback;
      },
      { isolationLevel: 'RepeatableRead', timeout: 30_000, maxWait: 30_000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }
}
async function seed(tx: Prisma.TransactionClient) {
  const tag = randomUUID();
  for (const suffix of ['a', 'b', 'c']) {
    await writeAudit({ actorId: null, action: `audit-test.${tag}.${suffix}`, target: tag }, tx);
  }
  return tx.auditLog.findMany({ orderBy: { seq: 'asc' } });
}

describe('audit origin, durable head, and snapshot consistency (OVA-145)', () => {
  it('accepts fresh empty history with an absent or null head', async () =>
    isolatedHistory(async (tx) => {
      expect(await verifyAuditChain(tx)).toEqual({ ok: true, checked: 0, legacy: 0 });
      await tx.auditChainHead.create({ data: { id: 1, lastHash: null } });
      expect(await verifyAuditChain(tx)).toEqual({ ok: true, checked: 0, legacy: 0 });
    }));

  it('accepts a legacy prefix while verifying the first chained origin and tail', async () =>
    isolatedHistory(async (tx) => {
      await tx.auditLog.create({ data: { actorId: null, action: 'legacy', target: 'legacy' } });
      expect(await verifyAuditChain(tx)).toEqual({ ok: true, checked: 0, legacy: 1 });
      await writeAudit({ actorId: null, action: 'first-chained', target: 'new' }, tx);
      expect(await verifyAuditChain(tx)).toEqual({ ok: true, checked: 1, legacy: 1 });
    }));

  it('accepts intact history without requiring gapless sequence values', async () =>
    isolatedHistory(async (tx) => {
      const rows = await seed(tx);
      await tx.auditLog.update({ where: { id: rows[2]!.id }, data: { seq: rows[2]!.seq + 10n } });
      expect(await verifyAuditChain(tx)).toEqual({ ok: true, checked: 3, legacy: 0 });
    }));

  it('detects a missing first segment', async () =>
    isolatedHistory(async (tx) => {
      const rows = await seed(tx);
      await tx.auditLog.delete({ where: { id: rows[0]!.id } });
      expect((await verifyAuditChain(tx)).brokenAt?.reason).toContain('origin');
    }));

  it('detects a removed tail through the durable head', async () =>
    isolatedHistory(async (tx) => {
      const rows = await seed(tx);
      await tx.auditLog.delete({ where: { id: rows[2]!.id } });
      expect((await verifyAuditChain(tx)).brokenAt?.reason).toContain('head does not match');
    }));

  it('detects deletion of every chained row when the durable head remains', async () =>
    isolatedHistory(async (tx) => {
      await seed(tx);
      await tx.auditLog.deleteMany();
      expect((await verifyAuditChain(tx)).brokenAt?.reason).toContain('head does not match');
    }));

  it('rejects chained history with a missing or cleared durable head', async () =>
    isolatedHistory(async (tx) => {
      await seed(tx);
      await tx.auditChainHead.update({ where: { id: 1 }, data: { lastHash: null } });
      expect((await verifyAuditChain(tx)).brokenAt?.reason).toContain('head does not match');
      await tx.auditChainHead.delete({ where: { id: 1 } });
      expect((await verifyAuditChain(tx)).brokenAt?.reason).toContain('head is missing');
    }));

  it('detects corrupted content and an internal missing segment', async () =>
    isolatedHistory(async (tx) => {
      const rows = await seed(tx);
      await tx.auditLog.update({ where: { id: rows[1]!.id }, data: { action: 'tampered' } });
      expect((await verifyAuditChain(tx)).brokenAt?.reason).toContain('entryHash mismatch');
      await tx.auditLog.update({ where: { id: rows[1]!.id }, data: { action: rows[1]!.action } });
      await tx.auditLog.delete({ where: { id: rows[1]!.id } });
      expect((await verifyAuditChain(tx)).brokenAt?.reason).toContain('prevHash linkage');
    }));

  it('rejects unchained suffixes and malformed legacy links', async () =>
    isolatedHistory(async (tx) => {
      const legacy = await tx.auditLog.create({
        data: { actorId: null, action: 'legacy', target: 'legacy', prevHash: 'unverifiable' },
      });
      expect((await verifyAuditChain(tx)).brokenAt?.reason).toContain('legacy row');
      await tx.auditLog.update({ where: { id: legacy.id }, data: { prevHash: null } });
      await writeAudit({ actorId: null, action: 'new', target: 'new' }, tx);
      await tx.auditLog.create({ data: { actorId: null, action: 'unchained', target: 'bad' } });
      expect((await verifyAuditChain(tx)).brokenAt?.reason).toContain('after chain start');
    }));

  it('uses one stable snapshot while a concurrent append commits', async () => {
    if (!validated) throw new Error('Disposable database guard did not pass');
    const initial = await verifyAuditChain();
    expect(initial.ok).toBe(true);
    await prisma.$transaction(
      async (tx) => {
        const before = await verifyAuditChain(tx); // Establishes this transaction's snapshot.
        await writeAudit({
          actorId: null,
          action: `audit-snapshot.${randomUUID()}`,
          target: 'snapshot',
        });
        const during = await verifyAuditChain(tx);
        expect(during).toEqual(before);
      },
      { isolationLevel: 'RepeatableRead', timeout: 30_000, maxWait: 30_000 },
    );
    const after = await verifyAuditChain();
    expect(after.ok).toBe(true);
    expect(after.checked).toBe(initial.checked + 1);
  });
});
