import { describe, expect, it } from 'vitest';
import {
  CHANNEL_PREFERENCE,
  PUSH_CHANNELS,
  expoPushTokenSchema,
  pushDataSchema,
  updateNotificationPreferencesSchema,
} from './push.js';

describe('push contract', () => {
  it('accepts both Expo token spellings and nothing else', () => {
    expect(expoPushTokenSchema.safeParse('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]').success).toBe(true);
    expect(expoPushTokenSchema.safeParse('ExpoPushToken[abc-123_DEF]').success).toBe(true);
    for (const bad of ['', 'fcm-token-abc', 'ExponentPushToken[]', 'ExponentPushToken[a b]', 'ExponentPushToken[abc'])
      expect(expoPushTokenSchema.safeParse(bad).success).toBe(false);
  });

  it('keeps bookings and payments unswitchable and maps every other channel to a preference', () => {
    expect(CHANNEL_PREFERENCE.bookings).toBeNull();
    for (const channel of PUSH_CHANNELS.filter((c) => c !== 'bookings'))
      expect(CHANNEL_PREFERENCE[channel]).not.toBeNull();
  });

  it('requires at least one preference in an update', () => {
    expect(updateNotificationPreferencesSchema.safeParse({}).success).toBe(false);
    expect(updateNotificationPreferencesSchema.safeParse({ messages: false }).success).toBe(true);
  });

  it('requires a dispatch id on push data', () => {
    expect(pushDataSchema.safeParse({ type: 'NEW_MESSAGE' }).success).toBe(false);
  });
});
