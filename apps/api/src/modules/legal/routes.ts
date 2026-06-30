import { Router, type Request, type Response, type NextFunction } from 'express';
import { prisma } from '@hq/database';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';
import { writeAudit } from '../audit.js';
import { PRIVACY_POLICY } from './policy.js';

type Handler = (req: AuthedRequest, res: Response) => Promise<void>;
const wrap =
  (h: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    h(req as AuthedRequest, res).catch(next);
  };

/**
 * Legal/publication surface (NDPR). Serves the current published privacy policy
 * and records a user's acceptance of a specific version. Mounted at /api/legal.
 */
export function legalRouter(): Router {
  const r = Router();

  // Public — a user must be able to read the policy without authenticating.
  r.get('/privacy-policy', (_req, res) => {
    res.json(PRIVACY_POLICY);
  });

  // Authed — record acceptance of the current published version (idempotent per
  // version, so re-accepting the same text is a no-op).
  r.post(
    '/privacy-policy/accept',
    requireAuth,
    wrap(async (req, res) => {
      const userId = req.auth.userId;
      const { documentKey, version } = PRIVACY_POLICY;
      const acceptance = await prisma.policyAcceptance.upsert({
        where: { userId_documentKey_version: { userId, documentKey, version } },
        update: {},
        create: { userId, documentKey, version },
      });
      await writeAudit({ actorId: userId, action: 'policy.accept', target: `${documentKey}@${version}` });
      res.status(201).json({
        documentKey: acceptance.documentKey,
        version: acceptance.version,
        acceptedAt: acceptance.acceptedAt,
      });
    }),
  );

  return r;
}
