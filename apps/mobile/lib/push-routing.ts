/**
 * Pure push helpers: parse a notification's data, decide which button was used,
 * and pick the screen it opens. Buttons never change state; they only navigate.
 * No native imports, so these are unit-tested.
 */
import { pushDataSchema, type PushAction, type PushData, type UserRole } from '@hq/shared';
import { clientOnboardingRoute } from './client-onboarding.js';
import { notificationRoute, type NotificationRoute } from './notifications.js';
import type { Me } from './types.js';

/** The HireQuick data inside a delivered notification, or null for anything else. */
export function parsePushData(data: unknown): PushData | null {
  const parsed = pushDataSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** Map a native action identifier to a button; the default tap is `open`. */
export function pushAction(actionIdentifier: string): PushAction {
  return actionIdentifier === 'view' || actionIdentifier === 'apply' ? actionIdentifier : 'open';
}

/** Every button opens the subject's screen; Apply and Accept happen there, after the details. */
export function pushRoute(data: PushData, role: UserRole | undefined): NotificationRoute | null {
  return notificationRoute(
    { targetType: data.targetType ?? null, targetId: data.targetId ?? null },
    role,
  );
}

/**
 * Whether a tapped notification can open its screen now, from any screen of
 * the app, modals included. It waits while the account hasn't finished
 * onboarding (the same checks as the usher and client tab guards) and while
 * the user is part-way through sign-in or verification, where leaving would
 * lose the step.
 */
export function canOpenPushTarget(user: Me | null, group: string | undefined): boolean {
  if (!user || !group || group === '(auth)' || group === '(verification)') return false;
  if (user.role === 'USHER') return Boolean(user.usher?.displayName && user.usher.bio);
  return user.role === 'CLIENT' && clientOnboardingRoute(user) === null;
}

const PROMPT_SNOOZE_MS = 7 * 24 * 60 * 60_000;

/**
 * The soft prompt returns a week after "Not now". It never shows once push is
 * fully on, after the account turned push off, or when the phone blocks it
 * (settings explain how to change that).
 */
export function shouldShowPushPrompt(input: {
  permission: 'granted' | 'denied' | 'undetermined';
  consent: 'none' | 'granted' | 'withdrawn';
  dismissedAt: number | null;
  now: number;
}): boolean {
  if (input.permission === 'denied' || input.consent === 'withdrawn') return false;
  if (input.permission === 'granted' && input.consent === 'granted') return false;
  return input.dismissedAt === null || input.now - input.dismissedAt >= PROMPT_SNOOZE_MS;
}
