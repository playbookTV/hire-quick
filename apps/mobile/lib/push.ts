/**
 * Device push setup over expo-notifications: Android channels, button
 * categories, OS permission, the account's push consent and Expo token
 * registration. The API sends only after an explicit PUSH_NOTIFICATIONS grant;
 * a registered token on its own sends nothing. Signing out detaches the phone
 * both from the account and from FCM/APNs, and stops Expo linking it again, so
 * the previous account's pushes stop even when the API can't be reached.
 * Native-only: on web and simulators push is
 * reported as unavailable.
 */
import { AppState, Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import type { PushCategory, PushChannel } from '@hq/shared';
import { api } from './client.js';

export type PushPermission = 'granted' | 'denied' | 'undetermined';

const TOKEN_KEY = 'hirequick.push-token';
const PROMPT_KEY = 'hirequick.push-prompt-dismissed-at';
// Set while a sign-out's OS steps (auto-registration off, unregistration) are
// unfinished; cleared once they, or a registration for the account now signed
// in, succeed.
const CLEANUP_KEY = 'hirequick.push-cleanup-pending';
const native = Platform.OS === 'ios' || Platform.OS === 'android';

const CHANNELS: Record<PushChannel, { name: string; importance: Notifications.AndroidImportance }> = {
  bookings: { name: 'Bookings and payments', importance: Notifications.AndroidImportance.HIGH },
  reminders: { name: 'Event reminders', importance: Notifications.AndroidImportance.HIGH },
  messages: { name: 'Messages', importance: Notifications.AndroidImportance.HIGH },
  job_alerts: { name: 'Job alerts', importance: Notifications.AndroidImportance.DEFAULT },
};

// Buttons only open the app; applying or accepting happens on the screen they open.
const CATEGORIES: Record<PushCategory, Notifications.NotificationAction[]> = {
  job_alert: [
    { identifier: 'view', buttonTitle: 'View details', options: { opensAppToForeground: true } },
    { identifier: 'apply', buttonTitle: 'Apply', options: { opensAppToForeground: true } },
  ],
  invitation: [
    { identifier: 'view', buttonTitle: 'View invitation', options: { opensAppToForeground: true } },
  ],
};

let configuring: Promise<void> | null = null;
// Whether an account is signed in on this phone. Foreground pushes are shown,
// and this device registered, only while it is.
let sessionActive = false;
// A token the API could not confirm removing at sign-out; the logout request
// carries it as a second chance (`takeUnconfirmedPushToken`).
let unconfirmedToken: string | null = null;
// Registration and cleanup run one at a time, so a cleanup cannot undo a new
// registration. Every step inside has a time limit, so the queue always drains,
// and sign-out never waits on it for more than a moment.
let queue: Promise<unknown> = Promise.resolve();
// The registration queued or running now, which sign-out briefly waits for.
let registration: Promise<boolean> | null = null;
// Counts sign-outs. A registration requested before one must not treat its own
// success as owning the install, or it would cancel that sign-out's cleanup.
let signOuts = 0;

// No provider or OS call may hold the queue, or sign-out, indefinitely.
const LIMIT_MS = { token: 10_000, request: 10_000, unregister: 8_000, tray: 2_000 };
// Backoff for a failed registration: doubling from the first delay up to the cap.
const RETRY_MS = { first: 5_000, max: 120_000 };
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;
// Bumped by `stopPushRetries`, so a registration already running then schedules none.
let retryEpoch = 0;
// The newest token FCM/APNs handed the token listener. Only registrations the
// listener started use it (`watchPushToken`), reading it as they run, so a
// retry links the newest token, never the one it began with. It goes stale
// while the listener is detached, so every other registration fetches its own.
let handedToken: Notifications.DevicePushToken | undefined;
// When this session's latest registration attempt succeeded, or null if it
// failed or none has run. Returning to the foreground registers again while it
// is null or older than REFRESH_MS (`keepPushRegistered`).
let registeredAt: number | null = null;
// Count successful registrations and landed token deletions, so a late
// deletion can tell it undid a finished registration (`finishCleanup`), and a
// registration that a deletion landed during (`registerThisDevice`).
let registrations = 0;
let deletions = 0;
// Push turned off on another of the account's phones removes this one's
// registration too, so a success is only trusted this long.
const REFRESH_MS = 60 * 60_000;

function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.catch(() => undefined);
  return run;
}

function within<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

async function postWithin<T>(path: string, body: unknown, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await within(api.post<T>(path, body, { signal: controller.signal }), ms);
  } finally {
    clearTimeout(timer);
  }
}

export function setPushSession(active: boolean): void {
  sessionActive = active;
}

/** Foreground display, channels and categories. Android 13 needs a channel before the prompt. */
export function configurePush(): Promise<void> {
  if (!native) return Promise.resolve();
  configuring ??= (async () => {
    Notifications.setNotificationHandler({
      handleNotification: () =>
        Promise.resolve({
          shouldShowBanner: sessionActive,
          shouldShowList: sessionActive,
          shouldPlaySound: sessionActive,
          shouldSetBadge: false,
        }),
    });
    if (Platform.OS === 'android')
      await Promise.all(
        Object.entries(CHANNELS).map(([id, channel]) =>
          Notifications.setNotificationChannelAsync(id, channel),
        ),
      );
    await Promise.all(
      Object.entries(CATEGORIES).map(([id, actions]) =>
        Notifications.setNotificationCategoryAsync(id, actions),
      ),
    );
  })().catch((error: unknown) => {
    configuring = null;
    throw error;
  });
  return configuring;
}

export async function pushPermission(): Promise<PushPermission> {
  if (!native || !Device.isDevice) return 'denied';
  const { status } = await Notifications.getPermissionsAsync();
  if (status === Notifications.PermissionStatus.GRANTED) return 'granted';
  return status === Notifications.PermissionStatus.DENIED ? 'denied' : 'undetermined';
}

/** True when this device can never get a token (web, simulator). */
export function pushUnsupported(): boolean {
  return !native || !Device.isDevice;
}

/**
 * `device` is a token the token listener was handed. Passing it on skips the
 * native fetch, which would fire the listener again (`watchPushToken`).
 */
async function expoToken(device?: Notifications.DevicePushToken): Promise<string | null> {
  // Defaults to the EAS project id in app.json (`extra.eas.projectId`).
  const fetching = Notifications.getExpoPushTokenAsync(device ? { devicePushToken: device } : undefined);
  // Every request turns auto-registration on as it finishes, even after the
  // time limit below stopped waiting, so it goes straight back off.
  void fetching.then(stopAutoRegistration, () => undefined).catch(() => undefined);
  try {
    return (await within(fetching, LIMIT_MS.token)).data;
  } catch {
    // Android builds without Firebase config cannot get a token; offline it times out.
    return null;
  }
}

/**
 * Getting an Expo token turns on Expo's saved auto-registration. At every
 * launch it would then link this install's Expo token to a fresh FCM/APNs
 * token, signed in or not, undoing a sign-out's unregistration. The app keeps
 * it off (turning it off also cancels a link in progress) and links the token
 * itself, at every launch and token change and retrying with backoff, only
 * while an account is signed in with push allowed (`syncPushRegistration`,
 * `watchPushToken`).
 */
function stopAutoRegistration(): Promise<void> {
  return within(Notifications.setAutoServerRegistrationEnabledAsync(false), LIMIT_MS.tray);
}

/** Register again with a fresh token, after a deletion invalidated the linked one. */
function relink(): void {
  if (!sessionActive) return;
  registeredAt = null;
  void syncPushRegistration().catch(() => undefined);
}

function registerThisDevice(useHandedToken = false): Promise<boolean> {
  const requestedAt = signOuts;
  const run = exclusive(async () => {
    // An unfinished sign-out must not later unregister this account's registration.
    await finishCleanup();
    if (!sessionActive) return false;
    const deletionsBefore = deletions;
    const epochBefore = retryEpoch;
    const token = await expoToken(useHandedToken ? handedToken : undefined);
    if (!token || !sessionActive) return false;
    // Saved before the request, so sign-out can always find what may be registered.
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    // Sign-out began meanwhile: its cleanup handles the install; don't register it.
    if (!sessionActive) return false;
    await postWithin('/api/me/devices', { token, platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID' }, LIMIT_MS.request);
    // Landed after a sign-out began: it registered the signed-out account, so
    // that sign-out's pending cleanup must still unregister the install.
    if (requestedAt !== signOuts) return false;
    // The install's current token now belongs to this account, so any earlier
    // account's registration is reassigned or no longer valid.
    await SecureStore.deleteItemAsync(CLEANUP_KEY).catch(() => undefined);
    registeredAt = Date.now();
    registrations += 1;
    // A deletion landing meanwhile may have invalidated the token just linked
    // (unless push stopped being allowed meanwhile).
    if (deletions !== deletionsBefore && retryEpoch === epochBefore) relink();
    return true;
  });
  registration = run;
  void run
    .finally(() => {
      if (registration === run) registration = null;
    })
    .catch(() => undefined);
  return run;
}

/**
 * Ask for OS permission if it can still be asked, record the account's consent,
 * then register this device. `denied` means the phone's settings block it.
 */
export async function enablePush(): Promise<'enabled' | 'denied' | 'unavailable'> {
  if (pushUnsupported()) return 'unavailable';
  await configurePush();
  const granted = Notifications.PermissionStatus.GRANTED;
  let { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status !== granted && canAskAgain)
    ({ status, canAskAgain } = await Notifications.requestPermissionsAsync());
  if (status !== granted) return 'denied';
  await api.post('/api/me/consents', { purpose: 'PUSH_NOTIFICATIONS', granted: true });
  return (await registerThisDevice()) ? 'enabled' : 'unavailable';
}

/**
 * Withdraw consent; the API removes every device registered to the account.
 * The saved token stays, so a later sign-out still clears this account's
 * notifications from the tray and unregisters the install.
 */
export async function disablePush(): Promise<void> {
  stopPushRetries();
  await api.post('/api/me/consents', { purpose: 'PUSH_NOTIFICATIONS', granted: false });
}

function cancelRetry(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

/** Drop a pending retry, when push stops being allowed or no one is signed in. */
export function stopPushRetries(): void {
  cancelRetry();
  retryAttempt = 0;
  retryEpoch += 1;
  registeredAt = null;
}

/**
 * Keep this device registered (and fresh) while permission and consent both
 * allow push. A registration that fails while the account is still signed in
 * (offline, Expo or the API unreachable) is retried with backoff, as Expo's
 * own token updates were before the app turned them off. `useHandedToken`
 * links the token the listener was last handed instead of fetching one.
 */
export async function syncPushRegistration(useHandedToken = false): Promise<void> {
  cancelRetry();
  const epoch = retryEpoch;
  if ((await pushPermission()) !== 'granted') {
    registeredAt = null;
    return;
  }
  await configurePush();
  if (await registerThisDevice(useHandedToken).catch(() => false)) {
    retryAttempt = 0;
    return;
  }
  registeredAt = null;
  // Not after sign-out or once push stopped being allowed (both stop retries).
  if (!sessionActive || epoch !== retryEpoch || retryTimer) return;
  const delay = Math.min(RETRY_MS.first * 2 ** retryAttempt, RETRY_MS.max);
  retryAttempt += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void syncPushRegistration(useHandedToken).catch(() => undefined);
  }, delay);
}

/**
 * Re-register when FCM/APNs rolls the token. Every native token fetch fires
 * this listener too, so it registers the token it is handed: fetching again
 * would fire it again, without end.
 */
export function watchPushToken(): { remove: () => void } {
  return Notifications.addPushTokenListener((device) => {
    handedToken = device;
    void syncPushRegistration(true).catch(() => undefined);
  });
}

/**
 * While an account is signed in with push allowed: register now, on every
 * token change, and on returning to the foreground unless a registration
 * succeeded within the last hour. That covers push just allowed in the phone's
 * settings, a failure whose retry was paused in the background, and this
 * phone's registration removed from another phone. `remove` stops all of it.
 */
export function keepPushRegistered(): { remove: () => void } {
  void syncPushRegistration().catch(() => undefined);
  const tokens = watchPushToken();
  const foreground = AppState.addEventListener('change', (state) => {
    const fresh = registeredAt !== null && Date.now() - registeredAt < REFRESH_MS;
    if (state === 'active' && !fresh) void syncPushRegistration().catch(() => undefined);
  });
  return {
    remove: () => {
      tokens.remove();
      foreground.remove();
      stopPushRetries();
    },
  };
}

async function unregisterOnServer(token: string, ms: number): Promise<boolean> {
  try {
    const result = await postWithin<{ removed?: boolean } | undefined>('/api/me/devices/unregister', { token }, ms);
    // `removed: false` may be a registration still landing; logout gets another try.
    return result?.removed === true;
  } catch {
    return false;
  }
}

/**
 * Sign-out: stop the signed-out account's pushes reaching this phone. Stops
 * any further registration at once and gives one in flight a moment to land.
 * With a live session the device is then removed from the account; if that
 * can't be confirmed the logout request carries the token too. Expo's
 * auto-registration is turned off, and the install unregistered from FCM/APNs
 * and the tray cleared in the background, whatever the server still holds,
 * retrying if that can't finish (Android offline).
 * Bounded by roughly twice `timeoutMs`, so sign-out always completes.
 * `session: false` covers a session that has already ended (e.g. expired, or
 * found expired at launch), when only the local steps are possible.
 */
export async function detachThisDevice(options: { session: boolean; timeoutMs?: number }): Promise<void> {
  if (!native) return;
  sessionActive = false;
  signOuts += 1;
  stopPushRetries();
  // Unregistering invalidates it.
  handedToken = undefined;
  const ms = options.timeoutMs ?? 3000;
  // At once, so the app being closed before the background steps run can't let
  // the next launch link this install again.
  void stopAutoRegistration().catch(() => undefined);
  try {
    if (registration) await within(registration, ms).catch(() => undefined);
    const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
    if (token) {
      // Recorded first, so a failure or crash below still ends in cleanup.
      await SecureStore.setItemAsync(CLEANUP_KEY, '1').catch(() => undefined);
      const removed = options.session && (await unregisterOnServer(token, ms));
      if (options.session && !removed) unconfirmedToken = token;
      await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
    }
  } finally {
    void resumePushCleanup();
  }
}

/** The token sign-out could not confirm removing, once; the logout request carries it. */
export function takeUnconfirmedPushToken(): string | null {
  const token = unconfirmedToken;
  unconfirmedToken = null;
  return token;
}

/**
 * Retry a sign-out's local cleanup. Cheap when nothing is pending; the app
 * calls it at launch, on returning to the foreground and on a timer.
 */
export function resumePushCleanup(): Promise<void> {
  if (!native) return Promise.resolve();
  return exclusive(finishCleanup);
}

/** An OS step that fails or times out (e.g. Android offline) leaves the cleanup pending. */
async function finishCleanup(): Promise<void> {
  try {
    if (!(await SecureStore.getItemAsync(CLEANUP_KEY).catch(() => null))) return;
    // Unregistering alone isn't enough: with auto-registration still on, the
    // next launch would link the install to a fresh token.
    await stopAutoRegistration();
    await Promise.allSettled([
      within(Notifications.dismissAllNotificationsAsync(), LIMIT_MS.tray),
      within(Notifications.setBadgeCountAsync(0), LIMIT_MS.tray),
      within(Notifications.clearLastNotificationResponseAsync(), LIMIT_MS.tray),
    ]);
    const before = registrations;
    const unregistering = Notifications.unregisterForNotificationsAsync();
    // A time-out stops waiting, not Firebase's deletion. Landing after a
    // registration linked the token, it invalidates it, so register again.
    void unregistering.then(() => {
      deletions += 1;
      if (registrations !== before && registeredAt !== null) relink();
    }, () => undefined);
    await within(unregistering, LIMIT_MS.unregister);
    // Again, cancelling a link Expo's launch check started while that ran.
    await stopAutoRegistration();
    await SecureStore.deleteItemAsync(CLEANUP_KEY);
  } catch {
    // Still pending.
  }
}

export async function readPromptDismissedAt(): Promise<number | null> {
  if (!native) return null;
  const value = Number(await SecureStore.getItemAsync(PROMPT_KEY).catch(() => null));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function snoozePushPrompt(now = Date.now()): Promise<void> {
  if (native) await SecureStore.setItemAsync(PROMPT_KEY, String(now)).catch(() => undefined);
}
