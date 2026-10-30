import { describe, expect, it } from 'vitest';
import { NotificationType } from '@hq/database';
import { NOTIFICATION_TYPES } from '@hq/shared';

describe('notification kinds', () => {
  // The mobile inbox types rows with the shared list, so a database kind
  // missing from it would reach the app untyped.
  it('lists every database notification type in @hq/shared', () => {
    expect([...NOTIFICATION_TYPES].sort()).toEqual(Object.values(NotificationType).sort());
  });
});
