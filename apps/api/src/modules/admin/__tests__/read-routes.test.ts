import { beforeEach, describe, expect, it, vi } from 'vitest';
// Read handlers use in-memory doubles; this suite never connects to a database.
const mocks = vi.hoisted(() => ({
  users: vi.fn(),
  ledger: vi.fn(),
  booking: vi.fn(),
  audit: vi.fn(),
  role: vi.fn(),
}));
vi.mock('@hq/database', () => ({
  prisma: {
    paymentOperation: { findUnique: vi.fn(async () => null) },
    approval: { findMany: vi.fn(async () => []) },
    user: { findMany: mocks.users },
    escrowLedger: { findMany: mocks.ledger },
    booking: { findUnique: mocks.booking },
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
  requireAuth: (_r: unknown, _s: unknown, next: () => void) => next(),
  requireRole: (role: string) => {
    mocks.role(role);
    return (_r: unknown, _s: unknown, next: () => void) => next();
  },
}));
vi.mock('../../audit.js', () => ({ writeAudit: mocks.audit }));
vi.mock('../service.js', () => ({
  resolveDispute: vi.fn(),
  createRefund: vi.fn(),
  decideApproval: vi.fn(),
  APPROVAL_THRESHOLD_KOBO: 5000000,
}));
vi.mock('../../verification/service.js', () => ({ reviewVerification: vi.fn() }));
import { adminRouter } from '../routes.js';
import { noopGateway } from '../../../realtime/gateway.js';
const router = adminRouter({ realtime: noopGateway });
const id = '00000000-0000-4000-8000-000000000001';
type RouteLayer = {
  route?: {
    path: string;
    stack: Array<{ handle: (req: unknown, res: unknown, next: (error: unknown) => void) => void }>;
  };
};
function read(
  path: string,
  query: Record<string, string> = {},
  params: Record<string, string> = {},
): Promise<unknown> {
  const layer = (router.stack as RouteLayer[]).find((item) => item.route?.path === path);
  return new Promise((resolve, reject) =>
    layer!.route!.stack[0]!.handle(
      { query, params, auth: { userId: id } },
      { json: resolve },
      reject,
    ),
  );
}
beforeEach(() => {
  mocks.users.mockReset();
  mocks.ledger.mockReset();
  mocks.booking.mockReset();
  mocks.audit.mockReset();
});
describe('admin read contracts', () => {
  it('retains the admin role gate and legacy array response', async () => {
    expect(mocks.role).toHaveBeenCalledWith('ADMIN');
    mocks.users.mockResolvedValue([{ id }]);
    expect(await read('/users')).toEqual([{ id }]);
  });
  it('paginates tied timestamps with deterministic ordering and lookahead', async () => {
    mocks.ledger.mockResolvedValue([{ id }, { id: 'next' }]);
    expect(await read('/ledger', { paged: 'true', limit: '1', cursor: id })).toEqual({
      items: [{ id }],
      nextCursor: id,
    });
    expect(mocks.ledger).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 2,
        skip: 1,
        cursor: { id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });
  it('applies user role and contact search together', async () => {
    mocks.users.mockResolvedValue([]);
    expect(await read('/users', { paged: 'true', query: 'sample', role: 'USHER' })).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(mocks.users).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          role: 'USHER',
          OR: [
            { phone: { contains: 'sample' } },
            { email: { contains: 'sample', mode: 'insensitive' } },
          ],
        },
      }),
    );
  });
  it('rejects invalid queries before touching persistence', async () => {
    await expect(read('/ledger', { limit: '-1' })).rejects.toThrow();
    expect(mocks.ledger).not.toHaveBeenCalled();
    await expect(read('/users', { cursor: 'invalid' })).rejects.toThrow();
    expect(mocks.users).not.toHaveBeenCalled();
  });
  it('audit-logs successful case reads and returns not-found explicitly', async () => {
    mocks.booking.mockResolvedValueOnce({ id, status: 'DISPUTED' }).mockResolvedValueOnce(null);
    expect(await read('/bookings/:id/review', {}, { id })).toEqual({
      id,
      status: 'DISPUTED',
      messages: [],
      conversation: undefined,
      refund: null,
      refundApprovals: [],
    });
    expect(mocks.audit).toHaveBeenCalledWith({
      actorId: id,
      action: 'admin.booking.review',
      target: id,
    });
    await expect(read('/bookings/:id/review', {}, { id })).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
