import { z } from 'zod';

export const chatMessageBody = z
  .object({
    clientMessageId: z.string().uuid().optional(),
    content: z.string().min(1).max(4000),
    contentType: z.enum(['TEXT', 'IMAGE', 'VOICE']).optional(),
  })
  .strict();
export const bookingChatScope = z.object({ bookingId: z.string().uuid() }).strict();
export const socketMessageInput = chatMessageBody.extend({ bookingId: z.string().uuid() });
export const serviceMessageInput = socketMessageInput.extend({ senderId: z.string().uuid() });
export const seenMessageInput = bookingChatScope.extend({
  upToMessageId: z.string().uuid().optional(),
});
export const seenMessageBody = seenMessageInput.omit({ bookingId: true });

export const messagePageInput = z
  .object({
    before: z.string().uuid().optional(),
    after: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    receiptIds: z
      .string()
      .transform((value) => value.split(','))
      .pipe(z.array(z.string().uuid()).max(100))
      .optional(),
  })
  .strict()
  .refine((value) => !(value.before && value.after), 'Choose before or after, not both');
