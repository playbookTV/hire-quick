import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type ErrorRequestHandler } from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  clientUpdate: vi.fn(),
  usherUpdate: vi.fn(),
  photos: vi.fn(),
}));
vi.mock('@hq/database', () => ({
  prisma: {
    user: { findUniqueOrThrow: mocks.user },
    client: { update: mocks.clientUpdate },
    usher: { update: mocks.usherUpdate },
    photo: { findMany: mocks.photos },
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
  requireAuth: (req: { auth: unknown }, _res: unknown, next: () => void) => {
    // A stale/requested role must never override the stored account role.
    req.auth = { userId: 'user', role: 'USHER' };
    next();
  },
}));
import { profileRouter } from '../routes.js';

const app = express();
app.use(express.json());
app.use('/api/me', profileRouter());
app.use(((error, _req, res, _next) => {
  res.status(error.statusCode ?? 500).json({ error: { code: error.code, message: error.message } });
}) as ErrorRequestHandler);

const base = { id: 'user', phone: '+2348000000000', status: 'ACTIVE', client: null, usher: null };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.photos.mockResolvedValue([]);
});

describe('profile onboarding', () => {
  it('rejects admin setup with an actionable error instead of a false success', async () => {
    mocks.user.mockResolvedValue({ ...base, role: 'ADMIN' });
    const response = await request(app)
      .patch('/api/me')
      .send({ displayName: 'Test Usher', bio: 'Events' });
    expect(response.status).toBe(403);
    expect(response.body.error).toMatchObject({ code: 'PROFILE_ROLE_UNSUPPORTED' });
    expect(response.body.error.message).toContain('different phone number');
    expect(mocks.clientUpdate).not.toHaveBeenCalled();
    expect(mocks.usherUpdate).not.toHaveBeenCalled();
  });

  it('keeps admin session reads available to the admin console', async () => {
    mocks.user.mockResolvedValue({ ...base, role: 'ADMIN' });
    const response = await request(app).get('/api/me');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ role: 'ADMIN', client: null, usher: null });
  });

  it.each(['CLIENT', 'USHER'])(
    'rejects a missing %s profile instead of silently discarding input',
    async (role) => {
      mocks.user.mockResolvedValue({ ...base, role });
      const response = await request(app).patch('/api/me').send({ displayName: 'Test Person' });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('PROFILE_MISSING');
      expect(mocks.clientUpdate).not.toHaveBeenCalled();
      expect(mocks.usherUpdate).not.toHaveBeenCalled();
    },
  );

  it('saves usher setup and returns the saved details on refresh', async () => {
    const user = { ...base, role: 'USHER', usher: { id: 'usher', displayName: null, bio: null } };
    mocks.user.mockImplementation(async () => user);
    mocks.usherUpdate.mockImplementation(async ({ data }) => Object.assign(user.usher, data));
    const details = {
      displayName: 'Test Usher',
      bio: 'Experienced event host',
      yearsExperience: 3,
      languages: ['English'],
    };
    expect((await request(app).patch('/api/me').send(details)).body).toEqual({ updated: true });
    const refreshed = await request(app).get('/api/me');
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.usher).toMatchObject(details);
    expect(mocks.clientUpdate).not.toHaveBeenCalled();
  });

  it('updates only the profile for the stored client role', async () => {
    mocks.user.mockResolvedValue({
      ...base,
      role: 'CLIENT',
      client: { id: 'client' },
      usher: { id: 'orphan' },
    });
    const response = await request(app)
      .patch('/api/me')
      .send({ displayName: 'Test Client', businessName: 'Events', bio: 'Ignored' });
    expect(response.status).toBe(200);
    expect(mocks.clientUpdate).toHaveBeenCalledWith({
      where: { id: 'client' },
      data: { displayName: 'Test Client', businessName: 'Events' },
    });
    expect(mocks.usherUpdate).not.toHaveBeenCalled();
  });

  it('does not claim success for fields that cannot update the account', async () => {
    mocks.user.mockResolvedValue({ ...base, role: 'USHER', usher: { id: 'usher' } });
    const response = await request(app).patch('/api/me').send({ businessName: 'Client field' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('NO_PROFILE_CHANGES');
    expect(mocks.usherUpdate).not.toHaveBeenCalled();
  });

  it('propagates a failed save rather than reporting success', async () => {
    mocks.user.mockResolvedValue({ ...base, role: 'USHER', usher: { id: 'usher' } });
    mocks.usherUpdate.mockRejectedValue(new Error('write failed'));
    expect((await request(app).patch('/api/me').send({ displayName: 'Test Usher' })).status).toBe(
      500,
    );
  });
});
