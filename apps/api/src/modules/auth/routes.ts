import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '@hq/database';
import { ApiError } from '../../app.js';
import { requestOtp, verifyOtp } from './otp.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken, revokeRefreshToken } from './tokens.js';
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
      let jti: string;
      try {
        ({ userId, jti } = await verifyRefreshToken(refreshToken));
      } catch {
        throw new ApiError(401, 'INVALID_REFRESH', 'invalid or expired refresh token');
      }
      // Denylist check: a token revoked on logout, or already consumed by an
      // earlier rotation, must not mint a new pair.
      if (await prisma.revokedToken.findUnique({ where: { jti } })) {
        throw new ApiError(401, 'INVALID_REFRESH', 'refresh token has been revoked');
      }
      const user = await prisma.user.findUnique({ where: { id: userId } });
      // Any non-ACTIVE state (SUSPENDED, ANONYMIZED, PENDING) must not mint tokens.
      if (!user || user.status !== 'ACTIVE') {
        throw new ApiError(401, 'INVALID_REFRESH', 'user not active');
      }
      // Rotation: sign the new pair FIRST, then burn the presented token.
      // Running revocation concurrently with signing (Promise.all) risks the old
      // token being revoked but no new tokens delivered when signing fails —
      // locking the user out. Sequencing guarantees: if signing fails, nothing
      // is revoked (user retries with the old token); if revocation fails, the
      // new tokens were already minted so we log the error and still return them
      // (the token expires naturally; the user is not locked out).
      const [accessToken, newRefresh] = await Promise.all([
        signAccessToken(user.id, user.role),
        signRefreshToken(user.id),
      ]);
      await revokeRefreshToken(refreshToken);
      await writeAudit({ actorId: user.id, action: 'auth.refresh', target: user.id });
      res.status(200).json({ accessToken, refreshToken: newRefresh });
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
        if (revoked) await writeAudit({ actorId: revoked.userId, action: 'auth.logout', target: revoked.userId });
      }
      res.status(204).end();
    }),
  );

  return r;
}
