import type { Request, Response, NextFunction } from 'express';
import type { UserRole } from '@hq/shared';
import { ApiError } from '../../app.js';
import { verifyAccessToken } from './tokens.js';

export interface Auth {
  userId: string;
  role: UserRole;
}
export interface AuthedRequest extends Request {
  auth: Auth;
  idempotencyKey?: string;
}

/** Verify the Bearer access token and attach req.auth (TRD §14/§15). */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    next(new ApiError(401, 'UNAUTHENTICATED', 'missing bearer token'));
    return;
  }
  verifyAccessToken(header.slice(7)).then(
    (auth) => {
      (req as AuthedRequest).auth = auth;
      next();
    },
    () => next(new ApiError(401, 'UNAUTHENTICATED', 'invalid or expired token')),
  );
}

/** Enforce the §15 RBAC matrix — caller must hold one of the given roles. */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = (req as AuthedRequest).auth;
    if (!auth || !roles.includes(auth.role)) {
      next(new ApiError(403, 'FORBIDDEN', 'insufficient role'));
      return;
    }
    next();
  };
}
