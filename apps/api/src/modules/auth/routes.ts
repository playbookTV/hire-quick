import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requestOtp, verifyOtp } from './otp.js';
import { adminEmailSchema, requestAdminEmailOtp, verifyAdminEmailOtp } from './admin-email-otp.js';
import { ApiError } from '../../app.js';
import { revokeRefreshToken } from './tokens.js';
import { rotateRefreshToken } from './rotation.js';
import { writeAudit } from '../audit.js';

type Handler = (req: Request, res: Response) => Promise<void>;
const wrap =
  (h: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    h(req, res).catch(next);
  };

const phone = z.string().regex(/^\+?\d{7,15}$/, 'invalid phone');
const otpRequestSchema = z.object({ phone });
const otpVerifySchema = z.object({
  phone,
  code: z.string().regex(/^\d{6}$/),
  role: z.enum(['CLIENT', 'USHER']).optional(),
});
const refreshSchema = z.object({ refreshToken: z.string().min(10) });
const adminOtpRequestSchema = z.object({ email: adminEmailSchema }).strict();
const adminOtpVerifySchema = z
  .object({
    email: adminEmailSchema,
    code: z.string().regex(/^\d{6}$/),
  })
  .strict();

export function authRouter(): Router {
  const r = Router();

  r.post(
    '/admin/otp/request',
    wrap(async (req, res) => {
      const { email } = adminOtpRequestSchema.parse(req.body);
      const out = await requestAdminEmailOtp(email);
      if (!out.sent) {
        throw new ApiError(
          502,
          'OTP_DELIVERY_FAILED',
          'We could not send your email code. Please try again.',
        );
      }
      res.status(200).json(out);
    }),
  );

  r.post(
    '/admin/otp/verify',
    wrap(async (req, res) => {
      const { email, code } = adminOtpVerifySchema.parse(req.body);
      res.status(200).json(await verifyAdminEmailOtp(email, code));
    }),
  );

  r.post(
    '/otp/request',
    wrap(async (req, res) => {
      const { phone: p } = otpRequestSchema.parse(req.body);
      const out = await requestOtp(p);
      // Surface real delivery status (out.sent) instead of always-true.
      res.status(out.sent ? 200 : 502).json(out);
    }),
  );

  r.post(
    '/otp/verify',
    wrap(async (req, res) => {
      const body = otpVerifySchema.parse(req.body);
      const result = await verifyOtp(body.phone, body.code, body.role);
      res.status(200).json(result);
    }),
  );

  r.post(
    '/refresh',
    wrap(async (req, res) => {
      const { refreshToken } = refreshSchema.parse(req.body);
      res.status(200).json(await rotateRefreshToken(refreshToken));
    }),
  );

  // Logout revokes the presented refresh token via the denylist (best-effort:
  // a malformed/expired token still returns 204 so logout is idempotent).
  r.post(
    '/logout',
    wrap(async (req, res) => {
      const parsed = refreshSchema.safeParse(req.body);
      if (parsed.success) {
        const revoked = await revokeRefreshToken(parsed.data.refreshToken);
        if (revoked)
          await writeAudit({
            actorId: revoked.userId,
            action: 'auth.logout',
            target: revoked.userId,
          });
      }
      res.status(204).end();
    }),
  );

  return r;
}
