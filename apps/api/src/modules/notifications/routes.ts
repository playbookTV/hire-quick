/**
 * In-app notification inbox (TRD §13). Read + mark-read over the caller's own
 * `Notification` rows; writes are append-only elsewhere (the `notify` helper),
 * this surface only flips `readAt`. Mounted at `/api/me`.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { prisma } from '@hq/database';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';
import { ApiError } from '../../app.js';

type Handler = (req: AuthedRequest, res: Response) => Promise<void>;
const wrap =
  (h: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    h(req as AuthedRequest, res).catch(next);
  };

export function notificationsRouter(): Router {
  const r = Router();
  r.use(requireAuth);

  // the caller's inbox — newest first, plus an unread count for the badge
  r.get(
    '/notifications',
    wrap(async (req, res) => {
      const [notifications, unreadCount] = await Promise.all([
        prisma.notification.findMany({
          where: { userId: req.auth.userId },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        prisma.notification.count({ where: { userId: req.auth.userId, readAt: null } }),
      ]);
      res.json({ notifications, unreadCount });
    }),
  );

  // mark a single notification read (idempotent; only the owner may)
  r.patch(
    '/notifications/:id/read',
    wrap(async (req, res) => {
      const id = String(req.params.id);
      const existing = await prisma.notification.findUnique({ where: { id }, select: { userId: true } });
      if (!existing || existing.userId !== req.auth.userId) {
        throw new ApiError(404, 'NOT_FOUND', 'notification not found');
      }
      await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
      res.json({ read: true });
    }),
  );

  // mark everything read (clears the badge)
  r.post(
    '/notifications/read-all',
    wrap(async (req, res) => {
      await prisma.notification.updateMany({
        where: { userId: req.auth.userId, readAt: null },
        data: { readAt: new Date() },
      });
      res.json({ read: true });
    }),
  );

  return r;
}
