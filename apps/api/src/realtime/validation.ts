import { z } from 'zod';

export const chatMessageBody = z.object({
  content: z.string().min(1).max(4000),
  contentType: z.enum(['TEXT', 'IMAGE', 'VOICE']).optional(),
}).strict();
export const bookingChatScope = z.object({ bookingId: z.string().uuid() }).strict();
export const socketMessageInput = chatMessageBody.extend({ bookingId: z.string().uuid() });
export const serviceMessageInput = socketMessageInput.extend({ senderId: z.string().uuid() });
export const seenMessageInput = bookingChatScope.extend({ upToMessageId: z.string().uuid().optional() });
export const seenMessageBody = seenMessageInput.omit({ bookingId: true });
