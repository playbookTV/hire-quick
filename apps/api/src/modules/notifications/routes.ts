/**
 * In-app notification inbox (TRD §13). Read + mark-read over the caller's own
 * `Notification` rows; writes are append-only elsewhere (the `notify` helper),
 * this surface only flips `readAt`. Also the caller's push category switches
 * and push-open reports. Mounted at `/api/me`.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '@hq/database';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  dispatchOpenedSchema,
  updateNotificationPreferencesSchema,
  type NotificationPreferences,
} from '@hq/shared';
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

  // push category switches; no row means everything is on
  r.get(
    '/notification-preferences',
    wrap(async (req, res) => {
      const row = await prisma.notificationPreference.findUnique({ where: { userId: req.auth.userId } });
      res.json(preferences(row));
    }),
  );

  r.put(
    '/notification-preferences',
    wrap(async (req, res) => {
      const parsed = updateNotificationPreferencesSchema.parse(req.body);
      const changes: Partial<NotificationPreferences> = {};
      for (const key of ['jobAlerts', 'reminders', 'messages'] as const) {
        const value = parsed[key];
        if (value !== undefined) changes[key] = value;
      }
      const row = await prisma.notificationPreference.upsert({
        where: { userId: req.auth.userId },
        update: changes,
        create: { userId: req.auth.userId, ...changes },
      });
      res.json(preferences(row));
    }),
  );

  // the app reports which push was opened and which button was used; first report wins
  r.post(
    '/notification-dispatches/:id/opened',
    wrap(async (req, res) => {
      const id = z.string().uuid().safeParse(req.params.id);
      if (!id.success) throw new ApiError(404, 'NOT_FOUND', 'notification not found');
      const { action } = dispatchOpenedSchema.parse(req.body);
      const owned = await prisma.notificationDispatch.findFirst({
        where: { id: id.data, userId: req.auth.userId },
        select: { id: true },
      });
      if (!owned) throw new ApiError(404, 'NOT_FOUND', 'notification not found');
      await prisma.notificationDispatch.updateMany({
        where: { id: id.data, openedAt: null },
        data: { openedAt: new Date(), action },
      });
      res.json({ opened: true });
    }),
  );

  return r;
}

function preferences(row: NotificationPreferences | null): NotificationPreferences {
  if (!row) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  return { jobAlerts: row.jobAlerts, reminders: row.reminders, messages: row.messages };
}
