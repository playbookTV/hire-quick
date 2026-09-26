import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '@hq/database';
import { ApiError } from '../../app.js';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';
import { assertMessageableParty, loadBookingParties, isParty } from '../../realtime/messages.js';
import { authorizedChatMediaKey, chatMediaKey, CHAT_MEDIA_MIME_TYPES } from './chat-media.js';
import { issueUpload } from './uploads.js';
import type { StoragePort } from './storage.js';

const uploadSchema = z.object({
  byteSize: z.number().int().positive(),
  contentType: z.enum(['IMAGE', 'VOICE']),
  mimeType: z.enum(CHAT_MEDIA_MIME_TYPES),
});
const routeIds = z.object({ id: z.string().uuid(), messageId: z.string().uuid().optional() });

export function chatMediaRouter(storage?: StoragePort): Router {
  const router = Router();
  router.use(requireAuth);
  router.post(
    '/bookings/:id/media/upload-url',
    wrap(async (req, res) => {
      const { id } = routeIds.parse(req.params);
      const { contentType, mimeType, byteSize } = uploadSchema.parse(req.body);
      await assertMessageableParty(id, req.auth.userId);
      if (!storage) throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'chat storage not configured');
      let key: string;
      try {
        key = chatMediaKey(id, req.auth.userId, contentType, mimeType);
      } catch {
        throw new ApiError(400, 'INVALID_MEDIA_TYPE', 'media type and file format must match');
      }
      res.json(
        await issueUpload(storage, {
          key,
          ownerId: req.auth.userId,
          scopeId: id,
          purpose: contentType,
          contentType: mimeType,
          byteSize,
        }),
      );
    }),
  );
  router.get(
    '/bookings/:id/messages/:messageId/media-url',
    wrap(async (req, res) => {
      const { id, messageId } = routeIds.parse(req.params);
      const parties = await loadBookingParties(id);
      if (!isParty(parties, req.auth.userId))
        throw new ApiError(403, 'FORBIDDEN', 'not a party to this booking');
      if (!storage) throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'chat storage not configured');
      const message = await prisma.message.findFirst({
        where: { id: messageId!, conversation: { bookingId: id } },
      });
      const key = message && authorizedChatMediaKey(message, { bookingId: id, ...parties });
      if (!key) throw new ApiError(404, 'MEDIA_UNAVAILABLE', 'chat media is unavailable');
      res.json({ url: await storage.presignDownload(key) });
    }),
  );
  return router;
}

function wrap(fn: (req: AuthedRequest, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req as AuthedRequest, res).catch(next);
  };
}
