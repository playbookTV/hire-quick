import { Prisma, prisma } from '@hq/database';
import { ApiError } from '../../app.js';
import { writeAudit } from '../audit.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from './tokens.js';

export interface RotationSigners {
  access: typeof signAccessToken;
  refresh: typeof signRefreshToken;
}

/**
 * TRD §§7/14: claim, sign, and audit in one commit. Reuse rejects only the
 * presented jti; the winning successor remains valid. There is no stored
 * session-family graph and no family-wide revocation in this policy.
 * A lost HTTP response after commit requires OTP login; consumed tokens are
 * never replayed to recover a successor, which could disclose it to an attacker.
 */
export async function rotateRefreshToken(
  token: string,
  signers: RotationSigners = { access: signAccessToken, refresh: signRefreshToken },
): Promise<{ accessToken: string; refreshToken: string }> {
  let claims: Awaited<ReturnType<typeof verifyRefreshToken>>;
  try {
    claims = await verifyRefreshToken(token);
  } catch {
    throw new ApiError(401, 'INVALID_REFRESH', 'invalid or expired refresh token');
  }
  return prisma.$transaction(
    async (tx) => {
      // SHARE prevents status changes during signing without conflicting with
      // the KEY SHARE lock used by logout's revoked-token foreign key check.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${claims.userId}::uuid FOR SHARE`;
      const user = await tx.user.findUnique({ where: { id: claims.userId } });
      if (claims.expiresAt.getTime() <= Date.now()) {
        throw new ApiError(401, 'INVALID_REFRESH', 'invalid or expired refresh token');
      }
      if (!user || user.status !== 'ACTIVE') {
        throw new ApiError(401, 'INVALID_REFRESH', 'user not active');
      }
      try {
        // The PK serializes simultaneous first uses; an upsert would accept both.
        await tx.revokedToken.create({ data: claims });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ApiError(401, 'INVALID_REFRESH', 'refresh token has been revoked');
        }
        throw error;
      }
      const refreshToken = await signers.refresh(user.id);
      const accessToken = await signers.access(user.id, user.role, refreshToken);
      await writeAudit({ actorId: user.id, action: 'auth.refresh', target: user.id }, tx);
      return { accessToken, refreshToken };
    },
    { timeout: 30_000, maxWait: 30_000 },
  );
}
