import express, { type ErrorRequestHandler } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import type * as AdminEmailOtp from '../admin-email-otp.js';

const mocks = vi.hoisted(() => ({ request: vi.fn(), verify: vi.fn(), phoneRequest: vi.fn() }));
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
vi.mock('../admin-email-otp.js', async (original) => ({
  ...(await original<typeof AdminEmailOtp>()),
  requestAdminEmailOtp: mocks.request,
  verifyAdminEmailOtp: mocks.verify,
}));
vi.mock('../otp.js', () => ({ requestOtp: mocks.phoneRequest, verifyOtp: vi.fn() }));
vi.mock('../tokens.js', () => ({
  revokeRefreshToken: vi.fn(),
  signAccessToken: vi.fn(),
  signRefreshToken: vi.fn(),
}));
vi.mock('../rotation.js', () => ({ rotateRefreshToken: vi.fn() }));
vi.mock('../../audit.js', () => ({ writeAudit: vi.fn() }));
import { authRouter } from '../routes.js';
const app = express();
app.use(express.json());
app.use('/auth', authRouter());
const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: { code: 'VALIDATION' } });
    return;
  }
  const apiError = error as { statusCode: number; code: string; message: string };
  res
    .status(apiError.statusCode ?? 500)
    .json({ error: { code: apiError.code, message: apiError.message } });
};
app.use(errorHandler);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.request.mockResolvedValue({ sent: true });
  mocks.verify.mockResolvedValue({
    accessToken: 'access',
    refreshToken: 'refresh',
    user: { role: 'ADMIN' },
  });
});
describe('admin email OTP HTTP contract', () => {
  it('normalizes request email and returns only sent status', async () => {
    const res = await request(app)
      .post('/auth/admin/otp/request')
      .send({ email: '  ADMIN@EXAMPLE.TEST ' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sent: true });
    expect(mocks.request).toHaveBeenCalledWith('admin@example.test');
    expect(mocks.phoneRequest).not.toHaveBeenCalled();
  });
  it.each([
    { email: 'invalid' },
    { email: 'admin@example.test', role: 'ADMIN' },
    { phone: '+2348000000000' },
  ])('rejects invalid request %j', async (body) => {
    expect((await request(app).post('/auth/admin/otp/request').send(body)).status).toBe(400);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('surfaces delivery failure in the common error envelope', async () => {
    mocks.request.mockResolvedValue({ sent: false });
    const res = await request(app)
      .post('/auth/admin/otp/request')
      .send({ email: 'admin@example.test' });
    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      error: { code: 'OTP_DELIVERY_FAILED', message: expect.stringContaining('email code') },
    });
  });
  it('requires a six-digit code and rejects role overposting', async () => {
    for (const body of [
      { email: 'admin@example.test', code: '12345' },
      { email: 'admin@example.test', code: '123456', role: 'ADMIN' },
    ])
      expect((await request(app).post('/auth/admin/otp/verify').send(body)).status).toBe(400);
    expect(mocks.verify).not.toHaveBeenCalled();
    const res = await request(app)
      .post('/auth/admin/otp/verify')
      .send({ email: ' ADMIN@EXAMPLE.TEST ', code: '012345' });
    expect(res.status).toBe(200);
    expect(mocks.verify).toHaveBeenCalledWith('admin@example.test', '012345');
    expect(res.body.accessToken).toBe('access');
  });
});
