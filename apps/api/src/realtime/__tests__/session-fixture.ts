import type { UserRole } from '@hq/shared';
import { signAccessToken, signRefreshToken } from '../../modules/auth/tokens.js';

/** Real signed session binding; does not touch the DB or fabricate revocation evidence. */
export async function socketToken(userId: string, role: UserRole): Promise<string> {
  return signAccessToken(userId, role, await signRefreshToken(userId));
}
