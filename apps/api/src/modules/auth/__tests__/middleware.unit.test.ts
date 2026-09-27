import express, { type ErrorRequestHandler } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserRole } from '@hq/shared';

const state = vi.hoisted(() => ({
  user: {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    role: 'ADMIN' as UserRole,
    status: 'ACTIVE',
  },
  missing: false,
  adminMutations: 0,
}));

vi.mock('../../../env.js', () => ({
  env: {
    JWT_ACCESS_SECRET: 'middleware-unit-access-secret',
    JWT_REFRESH_SECRET: 'middleware-unit-refresh-secret',
    JWT_ACCESS_TTL: 900,
    JWT_REFRESH_TTL: 3600,
  },
}));
vi.mock('../../../app.js', () => ({
  ApiError: class extends Error {
    constructor(public statusCode: number, public code: string, message: string) {
      super(message);
    }
  },
}));
vi.mock('@hq/database', () => ({
  prisma: {
    user: {
      // Honor the production select so adding role to a fake row alone cannot
      // accidentally hide a missing role selection in the real middleware.
      findUnique: async ({ where, select }: {
        where: { id: string };
        select: Record<string, boolean>;
      }) => {
        if (state.missing || where.id !== state.user.id) return null;
        return Object.fromEntries(
          Object.keys(select).filter((key) => select[key])
            .map((key) => [key, state.user[key as keyof typeof state.user]]),
        );
      },
    },
  },
}));

import { requireAuth, requireRole, type AuthedRequest } from '../middleware.js';
import { signAccessToken, signRefreshToken } from '../tokens.js';

const app = express();
app.get('/session', requireAuth, (req, res) => res.json((req as AuthedRequest).auth));
app.post('/admin-operation', requireAuth, requireRole('ADMIN'), (_req, res) => {
  state.adminMutations += 1;
  res.status(204).end();
});
const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  res.status(error.statusCode ?? 500).json({ error: { code: error.code ?? 'INTERNAL' } });
};
app.use(errorHandler);

async function access(role: UserRole, bound = true) {
  return signAccessToken(
    state.user.id,
    role,
    bound ? await signRefreshToken(state.user.id) : undefined,
  );
}
const admin = (token: string) => request(app).post('/admin-operation').set('Authorization', `Bearer ${token}`);

beforeEach(() => {
  state.user.role = 'ADMIN';
  state.user.status = 'ACTIVE';
  state.missing = false;
  state.adminMutations = 0;
});

describe('HTTP live-role authorization', () => {
  it.each(['CLIENT', 'USHER', 'ADMIN'] as const)('allows unchanged %s sessions', async (role) => {
    state.user.role = role;
    const response = await request(app).get('/session').set('Authorization', `Bearer ${await access(role)}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId: state.user.id, role });
  });

  it('rejects a downgraded ADMIN token before any protected mutation, and applies the new role to a fresh token', async () => {
    const stale = await access('ADMIN');
    expect((await admin(stale)).status).toBe(204);
    state.adminMutations = 0;
    state.user.role = 'CLIENT';
    const rejected = await admin(stale);
    expect(rejected.status).toBe(401);
    expect(rejected.body.error.code).toBe('ROLE_CHANGED');
    expect(state.adminMutations).toBe(0);
    const current = await access('CLIENT');
    expect((await admin(current)).status).toBe(403);
    expect((await request(app).get('/session').set('Authorization', `Bearer ${current}`)).status).toBe(200);
    expect(state.adminMutations).toBe(0);
  });

  it('does not promote an old CLIENT token when its account becomes ADMIN', async () => {
    state.user.role = 'CLIENT';
    const stale = await access('CLIENT');
    state.user.role = 'ADMIN';
    const rejected = await admin(stale);
    expect(rejected.status).toBe(401);
    expect(rejected.body.error.code).toBe('ROLE_CHANGED');
    expect(state.adminMutations).toBe(0);
    expect((await admin(await access('ADMIN'))).status).toBe(204);
    expect(state.adminMutations).toBe(1);
  });

  it.each(['SUSPENDED', 'ANONYMIZED'])('preserves inactive-account rejection for %s, including a changed role', async (status) => {
    const token = await access('ADMIN');
    state.user.status = status;
    state.user.role = 'CLIENT';
    const response = await admin(token);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ACCOUNT_INACTIVE');
    expect(state.adminMutations).toBe(0);
  });

  it('rejects missing accounts, anonymous requests and malformed tokens', async () => {
    const token = await access('ADMIN');
    state.missing = true;
    const missing = await admin(token);
    expect(missing.status).toBe(403);
    expect(missing.body.error.code).toBe('ACCOUNT_INACTIVE');
    expect((await request(app).post('/admin-operation')).status).toBe(401);
    expect((await admin('invalid-token')).status).toBe(401);
    expect(state.adminMutations).toBe(0);
  });

  it('preserves legacy access without a session binding when the role is current', async () => {
    expect((await admin(await access('ADMIN', false))).status).toBe(204);
  });
});
