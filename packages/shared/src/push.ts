/**
 * Push notification contract shared by the API sender and the mobile handler.
 * Delivery runs through Expo's push service; see
 * documentation/push-notifications-plan-2026-10-27.md for the scenario map.
 */
import { z } from 'zod';

/** Android notification channels. The mobile app creates them; the API picks one per push. */
export const PUSH_CHANNELS = ['bookings', 'reminders', 'messages', 'job_alerts'] as const;
export type PushChannel = (typeof PUSH_CHANNELS)[number];

/** iOS/Android notification categories with buttons. Buttons only open screens. */
export const PUSH_CATEGORIES = ['job_alert', 'invitation'] as const;
export type PushCategory = (typeof PUSH_CATEGORIES)[number];

/** Button identifiers within a category; the default tap is `open`. */
export const PUSH_ACTIONS = ['open', 'view', 'apply'] as const;
export type PushAction = (typeof PUSH_ACTIONS)[number];

/** Per-user category switches inside the single push consent. Bookings and payments cannot be muted. */
export const notificationPreferencesSchema = z.object({
  jobAlerts: z.boolean(),
  reminders: z.boolean(),
  messages: z.boolean(),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
export const updateNotificationPreferencesSchema = notificationPreferencesSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'at least one preference is required');

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  jobAlerts: true,
  reminders: true,
  messages: true,
};

/** The preference that gates each channel; `null` means it is always on while push is on. */
export const CHANNEL_PREFERENCE: Record<PushChannel, keyof NotificationPreferences | null> = {
  bookings: null,
  reminders: 'reminders',
  messages: 'messages',
  job_alerts: 'jobAlerts',
};

/** Expo push tokens: `ExponentPushToken[…]` (or the newer `ExpoPushToken[…]`). */
export const expoPushTokenSchema = z
  .string()
  .regex(/^Expo(nent)?PushToken\[[^\]\s]{1,200}\]$/, 'not an Expo push token');

export const registerDeviceSchema = z.object({
  token: expoPushTokenSchema,
  platform: z.enum(['IOS', 'ANDROID']),
});
export const unregisterDeviceSchema = z.object({ token: expoPushTokenSchema });

/** The `data` object every push carries; the app routes taps from it. */
export const pushDataSchema = z.object({
  type: z.string().min(1).max(64),
  targetType: z.string().min(1).max(32).optional(),
  targetId: z.string().min(1).max(64).optional(),
  dispatchId: z.string().uuid(),
});
export type PushData = z.infer<typeof pushDataSchema>;

export const dispatchOpenedSchema = z.object({ action: z.enum(PUSH_ACTIONS) });
