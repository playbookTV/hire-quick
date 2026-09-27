import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type * as DatabaseModule from '@hq/database';
import { createApp } from '../../app.js';
import { verifyAccessToken } from '../../modules/auth/tokens.js';
import type * as TokenModule from '../../modules/auth/tokens.js';

const read = vi.hoisted(() => vi.fn(async () => ({ allowed: true })));
const user = vi.hoisted(() => vi.fn());
vi.mock('@hq/database', async (original) => ({
  ...(await original<typeof DatabaseModule>()),
  prisma: { user: { findUnique: user } },
}));
vi.mock('../../modules/auth/tokens.js', async (original) => ({
  ...(await original<typeof TokenModule>()),
  verifyAccessToken: vi.fn(),
}));
vi.mock('../dashboard.js', () => ({ createMonitoringDashboard: () => read }));
afterEach(() => { vi.restoreAllMocks(); read.mockClear(); user.mockReset(); });
describe('observability access boundary', () => {
  it('rejects anonymous access', async () => {
    expect((await request(createApp()).get('/api/admin/observability')).status).toBe(401);
    expect(read).not.toHaveBeenCalled();
  });
  it.each(['CLIENT', 'USHER'] as const)('rejects authenticated %s users', async (role) => {
    vi.mocked(verifyAccessToken).mockResolvedValue({ userId: 'user', role });
    user.mockResolvedValue({ status: 'ACTIVE', role });
    const result = await request(createApp())
      .get('/api/admin/observability')
      .set('Authorization', 'Bearer test');
    expect(result.status).toBe(403);
    expect(read).not.toHaveBeenCalled();
  });
  it('rejects a suspended admin and permits an active admin', async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({ userId: 'admin', role: 'ADMIN' });
    user.mockResolvedValue({ status: 'SUSPENDED', role: 'ADMIN' });
    const app = createApp();
    expect(
      (await request(app).get('/api/admin/observability').set('Authorization', 'Bearer test'))
        .status,
    ).toBe(403);
    user.mockResolvedValue({ status: 'ACTIVE', role: 'ADMIN' });
    const result = await request(app).get('/api/admin/observability').set('Authorization', 'Bearer test');
    expect(result.body).toEqual({ allowed: true });
    expect(result.headers['cache-control']).toBe('no-store');
    expect(read).toHaveBeenCalledTimes(1);
  });
});
