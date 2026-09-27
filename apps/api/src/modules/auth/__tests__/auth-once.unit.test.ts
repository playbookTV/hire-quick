/** Several /api routers each install requireAuth; a request must pay for one lookup. */
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Database from '@hq/database';
import type { PaystackPort } from '../../payments/port/paystack-port.js';

const findUnique = vi.hoisted(() => vi.fn());
vi.mock('@hq/database', async (importOriginal) => ({
  ...(await importOriginal<typeof Database>()),
  prisma: { user: { findUnique } },
}));

import { createApp } from '../../../app.js';
import { signAccessToken } from '../tokens.js';

const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const orderId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
// The payments router only mounts with a port; this request never reaches it.
const app = createApp({ paystack: {} as PaystackPort });

// Invalid email fails inside the handler, after every auth layer but before any
// other database access, so each user lookup is an authentication check.
async function charge(token: string) {
  return request(app)
    .post(`/api/payments/orders/${orderId}/charge`)
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', 'auth-once-unit-key')
    .send({ email: 'not-an-email' });
}

beforeEach(() => {
  findUnique.mockReset();
  findUnique.mockResolvedValue({ status: 'ACTIVE', role: 'CLIENT' });
});

describe('authentication across stacked /api routers', () => {
  it('looks up the user exactly once for a /api/payments request', async () => {
    const response = await charge(await signAccessToken(userId, 'CLIENT'));
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION');
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: userId },
      select: { status: true, role: true },
    });
  });

  it('still rejects inactive accounts and changed roles on that single lookup', async () => {
    findUnique.mockResolvedValue({ status: 'SUSPENDED', role: 'CLIENT' });
    const inactive = await charge(await signAccessToken(userId, 'CLIENT'));
    expect(inactive.status).toBe(403);
    expect(inactive.body.error.code).toBe('ACCOUNT_INACTIVE');

    findUnique.mockResolvedValue({ status: 'ACTIVE', role: 'USHER' });
    const changed = await charge(await signAccessToken(userId, 'CLIENT'));
    expect(changed.status).toBe(401);
    expect(changed.body.error.code).toBe('ROLE_CHANGED');
  });

  it('still rejects missing and invalid tokens without a lookup', async () => {
    const anonymous = await request(app).post(`/api/payments/orders/${orderId}/charge`).send({});
    expect(anonymous.status).toBe(401);
    expect((await charge('not-a-token')).status).toBe(401);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
