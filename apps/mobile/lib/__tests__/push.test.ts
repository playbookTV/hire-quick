/** Sign-out detaches the phone even when the API is unreachable; native modules are mocked. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rolled = vi.hoisted(() => ({ type: 'android', data: 'fcm-device-token' }));
const state = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    post: vi.fn<(path: string, body?: unknown, opts?: unknown) => Promise<unknown>>(),
    calls: [] as string[],
    autoRegistrationFails: false,
    tokenEvents: 0,
    appStateListener: null as ((state: string) => void) | null,
    tokenListener: null as ((token: { type: string; data: string }) => void) | null,
    notifications: {
      setNotificationHandler: vi.fn(),
      setNotificationChannelAsync: vi.fn(() => Promise.resolve(null)),
      setNotificationCategoryAsync: vi.fn(() => Promise.resolve(null)),
      getPermissionsAsync: vi.fn(() => Promise.resolve({ status: 'granted', canAskAgain: true })),
      getExpoPushTokenAsync: vi.fn((options?: { devicePushToken?: unknown }) => {
        state.calls.push('token');
        // Like both native modules: fetching the device token fires the token
        // listener. Capped, so a listener that fetches again fails the test
        // instead of looping without end.
        if (!options?.devicePushToken && state.tokenEvents++ < 5) state.tokenListener?.(rolled);
        // Like Expo: getting a token turns its saved auto-registration on.
        state.calls.push('auto-on');
        return Promise.resolve({ data: 'ExponentPushToken[next-account]' });
      }),
      addPushTokenListener: vi.fn((listener: (token: { type: string; data: string }) => void) => {
        state.tokenListener = listener;
        return { remove: () => undefined };
      }),
      setAutoServerRegistrationEnabledAsync: vi.fn((enabled: boolean) => {
        if (state.autoRegistrationFails) return Promise.reject(new Error('unavailable'));
        state.calls.push(enabled ? 'auto-on' : 'auto-off');
        return Promise.resolve();
      }),
      unregisterForNotificationsAsync: vi.fn(() => {
        state.calls.push('unregister');
        return Promise.resolve();
      }),
      dismissAllNotificationsAsync: vi.fn(() => {
        state.calls.push('dismiss');
        return Promise.resolve();
      }),
      setBadgeCountAsync: vi.fn(() => Promise.resolve(true)),
      clearLastNotificationResponseAsync: vi.fn(() => Promise.resolve()),
      AndroidImportance: { DEFAULT: 5, HIGH: 6 },
      PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
    },
  };
});
vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: {
    addEventListener: (_event: string, listener: (state: string) => void) => {
      state.appStateListener = listener;
      return { remove: () => (state.appStateListener = null) };
    },
  },
}));
vi.mock('expo-device', () => ({ isDevice: true }));
vi.mock('expo-notifications', () => state.notifications);
vi.mock('expo-secure-store', () => ({
  getItemAsync: (key: string) => Promise.resolve(state.store.get(key) ?? null),
  setItemAsync: (key: string, value: string) => Promise.resolve(void state.store.set(key, value)),
  deleteItemAsync: (key: string) => Promise.resolve(void state.store.delete(key)),
}));
vi.mock('../client.js', () => ({ api: { post: state.post } }));

const TOKEN = 'hirequick.push-token';
const PENDING = 'hirequick.push-cleanup-pending';
const previous = 'ExponentPushToken[previous-account]';

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  state.store.clear();
  state.calls.length = 0;
  state.tokenListener = null;
  state.autoRegistrationFails = false;
  state.tokenEvents = 0;
  state.appStateListener = null;
  state.post.mockResolvedValue({ removed: true });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('sign-out detaches the phone', () => {
  it('removes the device from the account, then unregisters the install and clears the tray', async () => {
    state.store.set(TOKEN, previous);
    const push = await import('../push.js');
    await push.detachThisDevice({ session: true });
    expect(state.post).toHaveBeenCalledWith(
      '/api/me/devices/unregister',
      { token: previous },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(state.store.has(TOKEN)).toBe(false);
    // The OS step runs in the background so sign-out never waits on it.
    await vi.waitFor(() => expect(state.store.has(PENDING)).toBe(false));
    // Auto-registration goes off at once, again before unregistering, and once
    // more after, cancelling a launch-time link Expo started meanwhile.
    expect(state.calls).toEqual(['auto-off', 'auto-off', 'dismiss', 'unregister', 'auto-off']);
  });

  it('still unregisters the install when the API call fails, and hands the token to logout once', async () => {
    state.store.set(TOKEN, previous);
    state.post.mockRejectedValue(new Error('offline'));
    const push = await import('../push.js');
    await push.detachThisDevice({ session: true });
    await vi.waitFor(() => expect(state.store.has(PENDING)).toBe(false));
    expect(state.notifications.unregisterForNotificationsAsync).toHaveBeenCalledOnce();
    expect(state.notifications.dismissAllNotificationsAsync).toHaveBeenCalledOnce();
    expect(push.takeUnconfirmedPushToken()).toBe(previous);
    expect(push.takeUnconfirmedPushToken()).toBeNull();
  });

  it('hands nothing to logout when the API removed the device, and the token when it did not', async () => {
    state.store.set(TOKEN, previous);
    const push = await import('../push.js');
    await push.detachThisDevice({ session: true });
    expect(push.takeUnconfirmedPushToken()).toBeNull();

    // `removed: false` may be a registration still landing, so logout tries too.
    state.store.set(TOKEN, previous);
    state.post.mockResolvedValue({ removed: false });
    await push.detachThisDevice({ session: true });
    expect(push.takeUnconfirmedPushToken()).toBe(previous);
  });

  it('detaches locally when the session has already ended', async () => {
    state.store.set(TOKEN, previous);
    const push = await import('../push.js');
    await push.detachThisDevice({ session: false });
    expect(state.post).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(state.notifications.unregisterForNotificationsAsync).toHaveBeenCalledOnce());
  });

  it('keeps an unfinished cleanup pending and finishes it at the next launch', async () => {
    state.store.set(TOKEN, previous);
    state.notifications.unregisterForNotificationsAsync.mockRejectedValueOnce(new Error('offline'));
    const push = await import('../push.js');
    await push.detachThisDevice({ session: true });
    await vi.waitFor(() => expect(state.notifications.unregisterForNotificationsAsync).toHaveBeenCalledOnce());
    expect(state.store.get(PENDING)).toBe('1');

    vi.resetModules();
    const relaunched = await import('../push.js');
    await relaunched.resumePushCleanup();
    expect(state.notifications.unregisterForNotificationsAsync).toHaveBeenCalledTimes(2);
    expect(state.store.has(PENDING)).toBe(false);
  });

  it('leaves a phone that never registered alone', async () => {
    const push = await import('../push.js');
    await push.detachThisDevice({ session: true });
    await push.resumePushCleanup();
    expect(state.post).not.toHaveBeenCalled();
    // Only auto-registration goes off, in case a token fetch it never saw turned it on.
    expect(state.calls).toEqual(['auto-off']);
  });

  it('keeps the cleanup pending until auto-registration is off', async () => {
    state.store.set(TOKEN, previous);
    state.autoRegistrationFails = true;
    const push = await import('../push.js');
    await push.detachThisDevice({ session: true });
    await push.resumePushCleanup();
    // Unregistering alone would be undone by Expo's link at the next launch.
    expect(state.store.get(PENDING)).toBe('1');
    expect(state.notifications.unregisterForNotificationsAsync).not.toHaveBeenCalled();

    state.autoRegistrationFails = false;
    await push.resumePushCleanup();
    expect(state.notifications.unregisterForNotificationsAsync).toHaveBeenCalledOnce();
    expect(state.store.has(PENDING)).toBe(false);
  });

  it('does not let a hung OS unregister block sign-out or later cleanup', async () => {
    vi.useFakeTimers();
    state.store.set(TOKEN, previous);
    const hang = () => new Promise<void>(() => undefined);
    state.notifications.unregisterForNotificationsAsync.mockImplementationOnce(hang).mockImplementationOnce(hang);
    const push = await import('../push.js');
    await push.detachThisDevice({ session: true });
    expect(state.store.get(PENDING)).toBe('1');

    // The background attempt and this retry each give up after their time limit.
    const retry = push.resumePushCleanup();
    await vi.advanceTimersByTimeAsync(20_000);
    await retry;
    expect(state.notifications.unregisterForNotificationsAsync).toHaveBeenCalledTimes(2);
    expect(state.store.get(PENDING)).toBe('1');

    await push.resumePushCleanup();
    expect(state.store.has(PENDING)).toBe(false);
  });
});

describe('registration and sign-out', () => {
  it('never registers while no account is signed in', async () => {
    const push = await import('../push.js');
    await push.syncPushRegistration();
    expect(state.post).not.toHaveBeenCalled();
    expect(state.store.has(TOKEN)).toBe(false);
  });

  it('waits for a registration in flight, then removes what it registered', async () => {
    let finish: () => void = () => undefined;
    state.post.mockImplementationOnce(
      () => new Promise((resolve) => (finish = () => resolve({ registered: true }))),
    );
    const push = await import('../push.js');
    push.setPushSession(true);
    const registering = push.syncPushRegistration();
    await vi.waitFor(() =>
      expect(state.post).toHaveBeenCalledWith('/api/me/devices', expect.anything(), expect.anything()),
    );
    const signingOut = push.detachThisDevice({ session: true });
    finish();
    await Promise.all([registering, signingOut]);
    expect(state.post.mock.calls.map(([path]) => path)).toEqual([
      '/api/me/devices',
      '/api/me/devices/unregister',
    ]);
    expect(state.post).toHaveBeenLastCalledWith(
      '/api/me/devices/unregister',
      { token: 'ExponentPushToken[next-account]' },
      expect.anything(),
    );
    expect(state.store.has(TOKEN)).toBe(false);
  });

  it('signs out promptly even when a registration hangs', async () => {
    state.post.mockImplementation((path: string) =>
      path === '/api/me/devices' ? new Promise(() => undefined) : Promise.resolve({ removed: true }),
    );
    const push = await import('../push.js');
    push.setPushSession(true);
    void push.syncPushRegistration();
    await vi.waitFor(() =>
      expect(state.post).toHaveBeenCalledWith('/api/me/devices', expect.anything(), expect.anything()),
    );
    const started = Date.now();
    await push.detachThisDevice({ session: true, timeoutMs: 50 });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(state.post).toHaveBeenCalledWith(
      '/api/me/devices/unregister',
      { token: 'ExponentPushToken[next-account]' },
      expect.anything(),
    );
    expect(state.store.has(TOKEN)).toBe(false);
  });

  it('a registration that lands after sign-out stopped waiting cannot cancel its cleanup', async () => {
    let finish: () => void = () => undefined;
    state.post.mockImplementation((path: string) =>
      path === '/api/me/devices'
        ? new Promise((resolve) => (finish = () => resolve({ registered: true })))
        : Promise.resolve({ removed: false }),
    );
    const push = await import('../push.js');
    push.setPushSession(true);
    const registering = push.syncPushRegistration();
    await vi.waitFor(() =>
      expect(state.post).toHaveBeenCalledWith('/api/me/devices', expect.anything(), expect.anything()),
    );
    await push.detachThisDevice({ session: true, timeoutMs: 20 });
    expect(state.store.get(PENDING)).toBe('1');
    // The server may not have the row yet, so logout carries the token too.
    expect(push.takeUnconfirmedPushToken()).toBe('ExponentPushToken[next-account]');

    finish();
    await registering;
    await vi.waitFor(() =>
      expect(state.notifications.unregisterForNotificationsAsync).toHaveBeenCalledOnce(),
    );
    await vi.waitFor(() => expect(state.store.has(PENDING)).toBe(false));
  });

  it('turns auto-registration back off when a token fetch finishes after sign-out', async () => {
    let fetched: () => void = () => undefined;
    state.notifications.getExpoPushTokenAsync.mockImplementationOnce(() => {
      state.calls.push('token');
      return new Promise((resolve) => {
        fetched = () => {
          state.calls.push('auto-on');
          resolve({ data: 'ExponentPushToken[late]' });
        };
      });
    });
    const push = await import('../push.js');
    push.setPushSession(true);
    const registering = push.syncPushRegistration();
    await vi.waitFor(() => expect(state.calls).toContain('token'));
    // Nothing saved yet, so sign-out has no token to clean up after.
    await push.detachThisDevice({ session: true, timeoutMs: 20 });
    fetched();
    await registering;
    // Getting the token turned Expo's auto-registration on; the registration turns it off.
    expect(state.calls.at(-1)).toBe('auto-off');
    expect(state.post).not.toHaveBeenCalled();
    expect(state.store.has(TOKEN)).toBe(false);
  });

  it('turns auto-registration back off when a timed-out token fetch lands after sign-out', async () => {
    vi.useFakeTimers();
    let fetched: () => void = () => undefined;
    state.notifications.getExpoPushTokenAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          fetched = () => {
            state.calls.push('auto-on');
            resolve({ data: 'ExponentPushToken[slow]' });
          };
        }),
    );
    const push = await import('../push.js');
    push.setPushSession(true);
    const registering = push.syncPushRegistration();
    // The registration stops waiting for the token, and sign-out finishes.
    await vi.advanceTimersByTimeAsync(10_000);
    await registering;
    await push.detachThisDevice({ session: true });
    await push.resumePushCleanup();
    expect(state.post).not.toHaveBeenCalled();

    // The request was never cancelled: it lands now and turns auto-registration on.
    fetched();
    await vi.advanceTimersByTimeAsync(1);
    expect(state.calls.slice(-2)).toEqual(['auto-on', 'auto-off']);
  });

  it('keeps auto-registration off after every registration, so only the app links the token', async () => {
    const push = await import('../push.js');
    push.setPushSession(true);
    await push.syncPushRegistration();
    await vi.waitFor(() => expect(state.calls.slice(-3)).toEqual(['token', 'auto-on', 'auto-off']));
    expect(state.post).toHaveBeenCalledWith('/api/me/devices', expect.anything(), expect.anything());
  });

  it('lets a slow fetch from before sign-out land without undoing the next account', async () => {
    vi.useFakeTimers();
    let fetched: () => void = () => undefined;
    state.notifications.getExpoPushTokenAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          fetched = () => {
            state.calls.push('auto-on');
            resolve({ data: 'ExponentPushToken[slow]' });
          };
        }),
    );
    const push = await import('../push.js');
    push.setPushSession(true);
    const registering = push.syncPushRegistration();
    await vi.advanceTimersByTimeAsync(10_000);
    await registering;
    await push.detachThisDevice({ session: true });

    // The next account signs in and registers this install itself.
    push.setPushSession(true);
    await push.syncPushRegistration();
    expect(state.post).toHaveBeenCalledWith(
      '/api/me/devices',
      { token: 'ExponentPushToken[next-account]', platform: 'ANDROID' },
      expect.anything(),
    );
    fetched();
    await vi.advanceTimersByTimeAsync(1);
    // Off either way: the app links the next account's token at every launch.
    expect(state.calls.slice(-2)).toEqual(['auto-on', 'auto-off']);
    expect(state.post.mock.calls.filter(([path]) => path === '/api/me/devices')).toHaveLength(1);
  });

  it('ignores a registration requested once sign-out has started', async () => {
    const push = await import('../push.js');
    push.setPushSession(true);
    const signingOut = push.detachThisDevice({ session: true });
    await push.syncPushRegistration();
    await signingOut;
    expect(state.post).not.toHaveBeenCalled();
    expect(state.store.has(TOKEN)).toBe(false);
  });

  it('finishes the old cleanup before registering the account now signed in', async () => {
    state.store.set(PENDING, '1');
    const push = await import('../push.js');
    push.setPushSession(true);
    await push.syncPushRegistration();
    expect(state.calls).toEqual(['auto-off', 'dismiss', 'unregister', 'auto-off', 'token', 'auto-on', 'auto-off']);
    expect(state.post).toHaveBeenCalledWith(
      '/api/me/devices',
      { token: 'ExponentPushToken[next-account]', platform: 'ANDROID' },
      expect.anything(),
    );
    expect(state.store.get(TOKEN)).toBe('ExponentPushToken[next-account]');
    expect(state.store.has(PENDING)).toBe(false);
  });

  it('clears a still-pending cleanup once the new account owns the install', async () => {
    state.store.set(PENDING, '1');
    state.notifications.unregisterForNotificationsAsync.mockRejectedValueOnce(new Error('offline'));
    const push = await import('../push.js');
    push.setPushSession(true);
    await push.syncPushRegistration();
    // The token now registered belongs to this account, so a later launch must not unregister it.
    expect(state.store.has(PENDING)).toBe(false);
    expect(state.store.get(TOKEN)).toBe('ExponentPushToken[next-account]');
  });
});

describe('token changes', () => {
  it('registers a rolled token without fetching it again', async () => {
    const push = await import('../push.js');
    push.setPushSession(true);
    push.watchPushToken();
    // The fetch fires the listener once; the listener must not fetch again.
    await push.syncPushRegistration();
    await vi.waitFor(() => expect(state.post).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(state.notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(2);
    expect(state.notifications.getExpoPushTokenAsync).toHaveBeenLastCalledWith({ devicePushToken: rolled });
  });
});

describe('keeping the device registered', () => {
  const registrations = (): number =>
    state.post.mock.calls.filter(([path]) => path === '/api/me/devices').length;

  it('registers on returning from the phone settings that allowed push', async () => {
    state.notifications.getPermissionsAsync.mockResolvedValueOnce({ status: 'denied', canAskAgain: false });
    const push = await import('../push.js');
    push.setPushSession(true);
    const keeping = push.keepPushRegistered();
    await vi.waitFor(() => expect(state.notifications.getPermissionsAsync).toHaveBeenCalledOnce());
    expect(registrations()).toBe(0);

    // Back from settings with push allowed.
    state.appStateListener?.('active');
    await vi.waitFor(() => expect(registrations()).toBeGreaterThan(0));
    const settled = registrations();
    // Registered now, so later visits to the foreground send nothing more.
    state.appStateListener?.('active');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(registrations()).toBe(settled);

    keeping.remove();
    expect(state.appStateListener).toBeNull();
  });

  it('tries again on returning to the foreground after a failed registration', async () => {
    state.post.mockRejectedValueOnce(new Error('offline'));
    state.tokenEvents = 5; // Stops the mock's listener echo, so each attempt counts once.
    const push = await import('../push.js');
    push.setPushSession(true);
    push.keepPushRegistered();
    await vi.waitFor(() => expect(registrations()).toBe(1));
    state.appStateListener?.('active');
    await vi.waitFor(() => expect(registrations()).toBe(2));
  });
});

describe('registration repairs', () => {
  const registrations = (): number =>
    state.post.mock.calls.filter(([path]) => path === '/api/me/devices').length;

  it('registers again on returning to the foreground once the last success is an hour old', async () => {
    vi.useFakeTimers();
    state.tokenEvents = 5; // Stops the mock's listener echo, so each attempt counts once.
    const push = await import('../push.js');
    push.setPushSession(true);
    push.keepPushRegistered();
    await vi.advanceTimersByTimeAsync(0);
    expect(registrations()).toBe(1);
    state.appStateListener?.('active');
    await vi.advanceTimersByTimeAsync(0);
    expect(registrations()).toBe(1);
    // Push turned off on another phone may have removed this registration since.
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    state.appStateListener?.('active');
    await vi.advanceTimersByTimeAsync(0);
    expect(registrations()).toBe(2);
  });

  it('registers again when a timed-out token deletion lands after a registration', async () => {
    vi.useFakeTimers();
    state.store.set(PENDING, '1');
    state.tokenEvents = 5;
    let deleted: () => void = () => undefined;
    state.notifications.unregisterForNotificationsAsync.mockImplementationOnce(
      () => new Promise<void>((resolve) => (deleted = resolve)),
    );
    const push = await import('../push.js');
    push.setPushSession(true);
    const registering = push.syncPushRegistration();
    // The deletion outlives its time limit, so the registration goes ahead.
    await vi.advanceTimersByTimeAsync(8_000);
    await registering;
    expect(registrations()).toBe(1);
    expect(state.store.has(PENDING)).toBe(false);

    // Firebase finishes deleting the token that registration just linked.
    deleted();
    await vi.advanceTimersByTimeAsync(0);
    expect(registrations()).toBe(2);
    expect(state.notifications.getExpoPushTokenAsync).toHaveBeenLastCalledWith(undefined);
  });

  it('registers again when a timed-out token deletion lands during a registration', async () => {
    vi.useFakeTimers();
    state.store.set(PENDING, '1');
    state.tokenEvents = 5;
    let deleted: () => void = () => undefined;
    state.notifications.unregisterForNotificationsAsync.mockImplementationOnce(
      () => new Promise<void>((resolve) => (deleted = resolve)),
    );
    let fetched: () => void = () => undefined;
    state.notifications.getExpoPushTokenAsync.mockImplementationOnce(
      () => new Promise((resolve) => (fetched = () => resolve({ data: 'ExponentPushToken[next-account]' }))),
    );
    const push = await import('../push.js');
    push.setPushSession(true);
    const registering = push.syncPushRegistration();
    // The deletion outlives its time limit; the registration fetches a token.
    await vi.advanceTimersByTimeAsync(8_000);
    // Firebase deletes the token while the registration is still linking it.
    deleted();
    await vi.advanceTimersByTimeAsync(0);
    fetched();
    await registering;
    await vi.advanceTimersByTimeAsync(0);
    expect(registrations()).toBe(2);
    expect(state.notifications.getExpoPushTokenAsync).toHaveBeenLastCalledWith(undefined);
  });
});

describe('turning push off', () => {
  it('keeps the saved token, so a later sign-out still clears the tray', async () => {
    state.store.set(TOKEN, previous);
    const push = await import('../push.js');
    await push.disablePush();
    expect(state.store.get(TOKEN)).toBe(previous);
    await push.detachThisDevice({ session: true });
    await vi.waitFor(() => expect(state.store.has(PENDING)).toBe(false));
    expect(state.calls).toContain('dismiss');
    expect(state.calls).toContain('unregister');
  });
});

describe('token cache', () => {
  it('fetches a fresh token when push is turned back on, never the cached one', async () => {
    const push = await import('../push.js');
    push.setPushSession(true);
    const watching = push.watchPushToken();
    state.tokenListener?.(rolled);
    await vi.waitFor(() =>
      expect(state.post).toHaveBeenCalledWith('/api/me/devices', expect.anything(), expect.anything()),
    );
    // Push off detaches the listener, so a token change from here goes unseen.
    await push.disablePush();
    watching.remove();
    state.tokenListener = null;
    const before = state.notifications.getExpoPushTokenAsync.mock.calls.length;
    expect(await push.enablePush()).toBe('enabled');
    expect(state.notifications.getExpoPushTokenAsync.mock.calls[before]).toEqual([undefined]);
  });
});

describe('registration retries', () => {
  const registrations = (): number =>
    state.post.mock.calls.filter(([path]) => path === '/api/me/devices').length;

  it('retries a failed registration with backoff until it lands', async () => {
    vi.useFakeTimers();
    state.post.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline'));
    const push = await import('../push.js');
    push.setPushSession(true);
    await push.syncPushRegistration();
    expect(registrations()).toBe(1);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(registrations()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(registrations()).toBe(2);
    // The next wait doubles; this attempt lands, and nothing more is scheduled.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(registrations()).toBe(3);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(registrations()).toBe(3);
  });

  it('retries a rolled token that could not be linked while offline', async () => {
    vi.useFakeTimers();
    state.notifications.getExpoPushTokenAsync.mockRejectedValueOnce(new Error('offline'));
    const push = await import('../push.js');
    push.setPushSession(true);
    push.watchPushToken();
    state.tokenListener?.(rolled);
    await vi.advanceTimersByTimeAsync(0);
    expect(registrations()).toBe(0);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(state.notifications.getExpoPushTokenAsync).toHaveBeenLastCalledWith({ devicePushToken: rolled });
    expect(registrations()).toBe(1);
  });

  it('never lets a retry link an older rolled token over a newer one', async () => {
    vi.useFakeTimers();
    const older = { type: 'android', data: 'fcm-older' };
    const newer = { type: 'android', data: 'fcm-newer' };
    state.notifications.getExpoPushTokenAsync.mockRejectedValueOnce(new Error('offline'));
    const push = await import('../push.js');
    push.setPushSession(true);
    push.watchPushToken();
    state.tokenListener?.(older);
    await vi.advanceTimersByTimeAsync(0);
    // The retry for the older token fires but is slow to get going.
    let permit: () => void = () => undefined;
    state.notifications.getPermissionsAsync.mockImplementationOnce(
      () => new Promise((resolve) => (permit = () => resolve({ status: 'granted', canAskAgain: true }))),
    );
    await vi.advanceTimersByTimeAsync(5_000);
    // Meanwhile the token rolls again and the newer one registers first.
    state.tokenListener?.(newer);
    await vi.advanceTimersByTimeAsync(0);
    expect(state.notifications.getExpoPushTokenAsync).toHaveBeenLastCalledWith({ devicePushToken: newer });
    permit();
    await vi.advanceTimersByTimeAsync(0);
    expect(state.notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(3);
    expect(state.notifications.getExpoPushTokenAsync).toHaveBeenLastCalledWith({ devicePushToken: newer });
  });

  it('stops retrying at sign-out and when push stops being allowed', async () => {
    vi.useFakeTimers();
    state.post.mockImplementation((path: string) =>
      path === '/api/me/devices' ? Promise.reject(new Error('offline')) : Promise.resolve({ removed: true }),
    );
    const push = await import('../push.js');
    push.setPushSession(true);
    await push.syncPushRegistration();
    await push.detachThisDevice({ session: true });
    await vi.advanceTimersByTimeAsync(600_000);
    expect(registrations()).toBe(1);

    // Push turned off while an attempt was still running: when it fails, it
    // schedules nothing.
    let fail: () => void = () => undefined;
    state.post.mockImplementationOnce(
      () => new Promise((_, reject) => (fail = () => reject(new Error('offline')))),
    );
    push.setPushSession(true);
    const registering = push.syncPushRegistration();
    await vi.advanceTimersByTimeAsync(0);
    expect(registrations()).toBe(2);
    push.stopPushRetries();
    fail();
    await registering;
    await vi.advanceTimersByTimeAsync(600_000);
    expect(registrations()).toBe(2);
  });
});

describe('foreground display', () => {
  it('shows pushes only while an account is signed in', async () => {
    const push = await import('../push.js');
    await push.configurePush();
    const handler = state.notifications.setNotificationHandler.mock.calls[0]?.[0] as {
      handleNotification: () => Promise<{ shouldShowBanner: boolean; shouldPlaySound: boolean }>;
    };
    push.setPushSession(false);
    expect(await handler.handleNotification()).toMatchObject({ shouldShowBanner: false, shouldPlaySound: false });
    push.setPushSession(true);
    expect(await handler.handleNotification()).toMatchObject({ shouldShowBanner: true, shouldPlaySound: true });
  });
});
