import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '@hq/database';
import { ApiError } from '../../app.js';
import { requestOtp, verifyOtp } from './otp.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from './tokens.js';
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

export function authRouter(): Router {
  const r = Router();

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
      let userId: string;
      try {
        ({ userId } = await verifyRefreshToken(refreshToken));
      } catch {
        throw new ApiError(401, 'INVALID_REFRESH', 'invalid or expired refresh token');
      }
      const user = await prisma.user.findUnique({ where: { id: userId } });
      // Any non-ACTIVE state (SUSPENDED, ANONYMIZED, PENDING) must not mint tokens.
      if (!user || user.status !== 'ACTIVE') {
        throw new ApiError(401, 'INVALID_REFRESH', 'user not active');
      }
      // Rotation: issue a fresh pair on every refresh.
      const [accessToken, newRefresh] = await Promise.all([
        signAccessToken(user.id, user.role),
        signRefreshToken(user.id),
      ]);
      await writeAudit({ actorId: user.id, action: 'auth.refresh', target: user.id });
      res.status(200).json({ accessToken, refreshToken: newRefresh });
    }),
  );

  // Stateless JWTs: logout is client-side discard. A refresh denylist is a
  // documented hardening item (Phase 9).
  r.post('/logout', (_req, res) => {
    res.status(204).end();
  });

  return r;
}
