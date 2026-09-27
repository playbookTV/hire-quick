import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { prisma, type Prisma } from '@hq/database';
import { verifyAuditChain, writeAudit } from '../../audit.js';

type Mutation = (tx: Prisma.TransactionClient, id: string) => Promise<unknown>;
const mutations: [string, Mutation][] = [
  ['ORM update', (tx, id) => tx.auditLog.update({ where: { id }, data: { action: 'changed' } })],
  ['ORM delete', (tx, id) => tx.auditLog.delete({ where: { id } })],
  ['raw update', (tx, id) => tx.$executeRaw`UPDATE audit_logs SET "actorId" = '00000000-0000-4000-8000-000000000001' WHERE id = ${id}::uuid`],
  ['raw delete', (tx, id) => tx.$executeRaw`DELETE FROM audit_logs WHERE id = ${id}::uuid`],
  ['truncate', (tx) => tx.$executeRaw`TRUNCATE TABLE audit_logs`],
  ['head delete', (tx) => tx.auditChainHead.delete({ where: { id: 1 } })],
  ['head truncate', (tx) => tx.$executeRaw`TRUNCATE TABLE audit_chain_head`],
];

describe('database-enforced audit history preservation', () => {
  it.each(mutations)('rejects %s while preserving valid appends', async (_name, mutate) => {
    const rollback = new Error('rollback audit protection fixture');
    try {
      await prisma.$transaction(async (tx) => {
        const tag = randomUUID();
        await writeAudit({ actorId: null, action: 'audit.protection', target: tag }, tx);
        const row = await tx.auditLog.findFirstOrThrow({ where: { target: tag } });
        const before = await verifyAuditChain(tx);
        expect(before.ok).toBe(true);
        await tx.$executeRaw`SAVEPOINT audit_mutation`;
        let rejection: unknown;
        try {
          await mutate(tx, row.id);
        } catch (error) {
          rejection = error;
        }
        // Also restores the original fixture when run against an unpatched DB.
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT audit_mutation`;
        expect(String(rejection)).toContain('audit history is append-only');
        expect(await verifyAuditChain(tx)).toEqual(before);
        await writeAudit({ actorId: null, action: 'audit.after-rejection', target: tag }, tx);
        expect(await verifyAuditChain(tx)).toEqual({ ...before, checked: before.checked + 1 });
        throw rollback;
      }, { isolationLevel: 'RepeatableRead', timeout: 30_000 });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });
});
