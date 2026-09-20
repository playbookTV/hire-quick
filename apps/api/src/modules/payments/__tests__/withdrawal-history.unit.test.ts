import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ wallet: vi.fn(), list: vi.fn(), one: vi.fn() }));
vi.mock('@hq/database', () => ({
  prisma: {
    usher: { findFirst: mocks.wallet },
    withdrawal: { findMany: mocks.list, findFirst: mocks.one },
  },
}));
vi.mock('../../../app.js', () => ({
  ApiError: class extends Error {
    constructor(
      public statusCode: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock('../../auth/middleware.js', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../audit.js', () => ({ writeAudit: vi.fn() }));
vi.mock('../service.js', () => ({
  initChargeForOrder: vi.fn(),
  createBankAccountForUsher: vi.fn(),
  initWithdrawal: vi.fn(),
}));
vi.mock('../checkout.js', () => ({ getCheckout: vi.fn(), resumeCheckout: vi.fn() }));
import { paymentsRouter } from '../http/routes.js';
const router = paymentsRouter({ paystack: {} } as Parameters<typeof paymentsRouter>[0]);
const id = '00000000-0000-4000-8000-000000000001';
type Layer = {
  route?: {
    path: string;
    methods: { get?: boolean };
    stack: { handle: (req: unknown, res: unknown, next: (error: unknown) => void) => void }[];
  };
};
function read(path: string, query = {}, params = {}) {
  const layer = (router.stack as unknown as Layer[]).find(
    (x) => x.route?.path === path && x.route.methods.get,
  )!;
  return new Promise((resolve, reject) =>
    layer.route!.stack[0]!.handle(
      { auth: { userId: 'owner' }, query, params },
      { json: resolve },
      reject,
    ),
  );
}
const row = {
  id,
  amount: 120000,
  status: 'PROCESSING',
  paystackTransferRef: 'safe-ref',
  createdAt: new Date(),
  updatedAt: new Date(),
  bankAccount: { bankCode: '058', accountNumber: '0123456789', accountName: 'Test Person' },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.wallet.mockResolvedValue({
    id: 'usher',
    wallet: { id: 'owned-wallet', availableBalance: 0 },
  });
});
describe('owned withdrawal history', () => {
  it('masks account numbers and scopes list queries to the authenticated wallet', async () => {
    mocks.list.mockResolvedValue([row]);
    expect(await read('/withdrawals')).toMatchObject({
      items: [{ id, status: 'PROCESSING', bank: { last4: '6789' } }],
      nextCursor: null,
    });
    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({ where: { walletId: 'owned-wallet' }, take: 26 }),
    );
    expect(JSON.stringify(await read('/withdrawals'))).not.toContain('0123456789');
  });
  it('rejects an unowned cursor before reading history', async () => {
    mocks.one.mockResolvedValue(null);
    await expect(read('/withdrawals', { cursor: id })).rejects.toMatchObject({
      code: 'INVALID_CURSOR',
    });
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it('returns not-found for an unowned detail and never queries by id alone', async () => {
    mocks.one.mockResolvedValue(null);
    await expect(read('/withdrawals/:id', {}, { id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mocks.one).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id, walletId: 'owned-wallet' } }),
    );
  });
  it('returns a stable lookahead cursor without leaking the next item', async () => {
    mocks.list.mockResolvedValue(Array.from({ length: 26 }, (_, n) => ({ ...row, id: String(n) })));
    const out = (await read('/withdrawals')) as { items: unknown[]; nextCursor: string };
    expect(out.items).toHaveLength(25);
    expect(out.nextCursor).toBe('24');
  });
});
