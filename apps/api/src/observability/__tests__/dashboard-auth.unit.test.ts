import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { prisma } from '@hq/database';
import { createApp } from '../../app.js';
import { verifyAccessToken } from '../../modules/auth/tokens.js';
import type * as TokenModule from '../../modules/auth/tokens.js';

const read = vi.hoisted(() => vi.fn(async () => ({ allowed: true })));
vi.mock('../../modules/auth/tokens.js', async (original) => ({
  ...(await original<typeof TokenModule>()),
  verifyAccessToken: vi.fn(),
}));
vi.mock('../dashboard.js', () => ({ createMonitoringDashboard: () => read }));
afterEach(() => { vi.restoreAllMocks(); read.mockClear(); });
describe('observability access boundary', () => {
  it('rejects anonymous access', async () => {
    expect((await request(createApp()).get('/api/admin/observability')).status).toBe(401);
    expect(read).not.toHaveBeenCalled();
  });
  it.each(['CLIENT', 'USHER'] as const)('rejects authenticated %s users', async (role) => {
    vi.mocked(verifyAccessToken).mockResolvedValue({ userId: 'user', role });
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({ status: 'ACTIVE' } as never);
    const result = await request(createApp())
      .get('/api/admin/observability')
      .set('Authorization', 'Bearer test');
    expect(result.status).toBe(403);
    expect(read).not.toHaveBeenCalled();
  });
  it('rejects a suspended admin and permits an active admin', async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({ userId: 'admin', role: 'ADMIN' });
    const user = vi
      .spyOn(prisma.user, 'findUnique')
      .mockResolvedValue({ status: 'SUSPENDED' } as never);
    const app = createApp();
    expect(
      (await request(app).get('/api/admin/observability').set('Authorization', 'Bearer test'))
        .status,
    ).toBe(403);
    user.mockResolvedValue({ status: 'ACTIVE' } as never);
    const result = await request(app).get('/api/admin/observability').set('Authorization', 'Bearer test');
    expect(result.body).toEqual({ allowed: true });
    expect(result.headers['cache-control']).toBe('no-store');
    expect(read).toHaveBeenCalledTimes(1);
  });
});
