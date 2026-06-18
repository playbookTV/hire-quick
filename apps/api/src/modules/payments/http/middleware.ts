import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../../../app.js';

/**
 * Requires an `Idempotency-Key` header on money-mutating (★) endpoints and
 * threads it to the handler, which passes it to the ledger's runIdempotent
 * (TRD §10/§24). Keeping the guard at the operation layer (not just here) avoids
 * orphaned keys when a handler fails.
 */
export function requireIdempotencyKey(req: Request, _res: Response, next: NextFunction): void {
  const key = req.header('idempotency-key');
  if (!key || key.length < 8) {
    next(new ApiError(400, 'IDEMPOTENCY_REQUIRED', 'Idempotency-Key header required'));
    return;
  }
  (req as Request & { idempotencyKey: string }).idempotencyKey = key;
  next();
}
