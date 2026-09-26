import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma, type PaymentOperation } from '@hq/database';
import { InMemoryPaystack } from '../../payments/port/paystack-port.js';
import { noopGateway } from '../../../realtime/gateway.js';
import { recordReconciliation } from '../../payments/ledger/reconciliation.js';
import { claimRecoveryBatch } from '../../payments/recovery-schedule.js';
import { reconcileStuckWithdrawals, resumePaymentOperation } from '../../payments/recovery.js';
import { jobAuditVerify, jobReconcile, jobResumePaymentOps } from '../jobs.js';
import { reportAlarm } from '../../../observability/reporting.js';
import { logger } from '../../../logger.js';
import * as audit from '../../audit.js';

vi.mock('../../../observability/reporting.js', () => ({ reportAlarm: vi.fn() }));
vi.mock('../../../logger.js', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

vi.mock('../../payments/ledger/reconciliation.js', () => ({ recordReconciliation: vi.fn() }));
vi.mock('../../payments/recovery-schedule.js', () => ({ claimRecoveryBatch: vi.fn() }));
vi.mock('../../payments/recovery.js', () => ({
  reconcileStuckWithdrawals: vi.fn(),
  resumePaymentOperation: vi.fn(),
}));

const deps = { prisma, paystack: new InMemoryPaystack() };
afterEach(() => vi.restoreAllMocks());
beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('payment operational alarms', () => {
  it.each(['approval backfill', 'legacy withdrawal'] as const)(
    'keeps scheduled operations progressing when %s fails',
    async (stage) => {
      const approvals = vi.spyOn(prisma.approval, 'findMany').mockResolvedValue([]);
      vi.mocked(reconcileStuckWithdrawals).mockResolvedValue({
        completed: 0,
        failed: 0,
        pending: 0,
      });
      if (stage === 'approval backfill') approvals.mockRejectedValue(new Error('unavailable'));
      else
        vi.mocked(reconcileStuckWithdrawals).mockRejectedValue(new Error('provider unavailable'));
      const op = { id: 'scheduled-operation', kind: 'BOOKING_REFUND' } as PaymentOperation;
      vi.mocked(claimRecoveryBatch).mockResolvedValue([op]);
      vi.mocked(resumePaymentOperation).mockResolvedValue('recorded');
      await expect(jobResumePaymentOps(deps)).rejects.toThrow(
        'Payment recovery legacy checks could not complete',
      );
      expect(resumePaymentOperation).toHaveBeenCalledTimes(1);
      expect(vi.mocked(resumePaymentOperation).mock.calls[0]?.[0]).toBe(deps);
      expect(vi.mocked(resumePaymentOperation).mock.calls[0]?.[1]).toBe(op);
    },
  );

  it('alerts on failed balance collection without leaking details and retains the job failure', async () => {
    const error = new Error('private provider response or database URL');
    vi.mocked(recordReconciliation).mockRejectedValue(error);
    const emitToAdmins = vi.fn();
    await expect(jobReconcile(deps, { ...noopGateway, emitToAdmins })).rejects.toBe(error);
    expect(emitToAdmins).toHaveBeenCalledWith(
      'recon:alarm',
      expect.objectContaining({ classification: 'error' }),
    );
    expect(JSON.stringify(emitToAdmins.mock.calls)).not.toContain(error.message);
    expect(JSON.stringify(vi.mocked(logger.info).mock.calls)).not.toContain(error.message);
    expect(reportAlarm).toHaveBeenCalledWith('RECONCILIATION_ERROR');
  });

  it('reports a completed but unhealthy reconciliation without reporting success', async () => {
    vi.mocked(recordReconciliation).mockResolvedValue({
      runId: '00000000-0000-0000-0000-000000000001', ok: false, classification: 'drift', driftKobo: 100,
      expectedKobo: 0, actualKobo: 100, staleHeldBookingIds: [], staleFrozenBookingIds: [],
      pendingOperations: 0, quarantinedOperations: 0, snapshotChanged: false,
    });
    await expect(jobReconcile(deps)).resolves.toBe(false);
    expect(reportAlarm).toHaveBeenCalledWith('RECONCILIATION_REVIEW');
    vi.mocked(reportAlarm).mockClear();
    vi.mocked(recordReconciliation).mockResolvedValue({
      runId: '00000000-0000-0000-0000-000000000001', ok: true, classification: 'balanced', driftKobo: 0,
      expectedKobo: 0, actualKobo: 0, staleHeldBookingIds: [], staleFrozenBookingIds: [],
      pendingOperations: 0, quarantinedOperations: 0, snapshotChanged: false,
    });
    await expect(jobReconcile(deps)).resolves.toBe(true);
    expect(reportAlarm).not.toHaveBeenCalled();
  });

  it('reports a broken audit chain as unhealthy', async () => {
    vi.spyOn(audit, 'verifyAuditChain').mockResolvedValue({ ok: false, checked: 2, legacy: 0 });
    await expect(jobAuditVerify()).resolves.toBe(false);
    expect(reportAlarm).toHaveBeenCalledWith('AUDIT_CHAIN_BROKEN');
  });

  it('continues the claimed batch after a failed recovery diagnostic write, then reports the job failure', async () => {
    vi.spyOn(prisma.approval, 'findMany').mockResolvedValue([]);
    vi.mocked(reconcileStuckWithdrawals).mockResolvedValue({ completed: 0, failed: 0, pending: 0 });
    const ops = [1, 2].map(
      (n) => ({ id: `operation-${n}`, kind: 'BOOKING_REFUND' }) as PaymentOperation,
    );
    vi.mocked(claimRecoveryBatch).mockResolvedValue(ops);
    vi.mocked(resumePaymentOperation)
      .mockRejectedValueOnce(new Error('provider unavailable'))
      .mockResolvedValueOnce('recorded');
    vi.spyOn(prisma.paymentOperation, 'updateMany').mockRejectedValue(
      new Error('database unavailable'),
    );
    await expect(jobResumePaymentOps(deps)).rejects.toThrow(
      'Payment recovery evidence could not be saved',
    );
    expect(resumePaymentOperation).toHaveBeenCalledTimes(2);
    expect(resumePaymentOperation).toHaveBeenLastCalledWith(deps, ops[1], noopGateway);
    expect(JSON.stringify(vi.mocked(logger.info).mock.calls)).not.toContain('database unavailable');
  });
});
