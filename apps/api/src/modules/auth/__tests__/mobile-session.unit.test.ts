import { describe, expect, it, vi } from 'vitest';
import { createSessionStore, SessionChanged } from '../../../../../mobile/lib/session-store.js';
import { createHttpClient } from '../../../../../mobile/lib/http-client.js';
import { createAuthSession } from '../../../../../mobile/lib/auth-session.js';
import { createSessionKeychain } from '../../../../../mobile/lib/session-keychain.js';

const original = { accessToken: 'access-a', refreshToken: 'refresh-a' };
const rotated = { accessToken: 'access-a2', refreshToken: 'refresh-a2' };
const second = { accessToken: 'access-b', refreshToken: 'refresh-b' };
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const unauthorized = () => ok({ error: { code: 'INVALID_REFRESH', message: 'expired' } }, 401);
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function storage(tokens: typeof original | null = original) {
  let value = JSON.stringify({ version: 1, tokens });
  return {
    read: vi.fn(async () => value),
    write: vi.fn(async (next: string) => {
      value = next;
    }),
    value: () => JSON.parse(value),
  };
}
function setup(transport: typeof fetch) {
  const disk = storage();
  const sessions = createSessionStore(disk);
  const http = createHttpClient('https://example.test', sessions, transport, () => 'request-id');
  const publish = vi.fn();
  const auth = createAuthSession<{ id: string }>({
    sessions,
    fetchMe: (signal) => http.request('/api/me', { signal }),
    revoke: http.revoke,
    publish,
  });
  http.setUnauthorizedHandler(auth.invalidated);
  return { disk, sessions, http, auth, publish };
}

/** Matches RN's abort-controller3 surface: events + aborted, no newer DOM helpers. */
class NativeAbortSignal extends EventTarget {
  aborted = false;
}
class NativeAbortController {
  readonly signal = new NativeAbortSignal();
  abort(): void {
    if (this.signal.aborted) return;
    this.signal.aborted = true;
    this.signal.dispatchEvent(new Event('abort'));
  }
}
async function withNativeAbort<T>(work: () => Promise<T>): Promise<T> {
  vi.stubGlobal('AbortController', NativeAbortController);
  try {
    return await work();
  } finally {
    vi.unstubAllGlobals();
  }
}

describe('mobile session persistence and lifecycle', () => {
  it.each(['restore', 'login'] as const)(
    '%s works with RN signals lacking throwIfAborted and reason',
    async (operation) => {
      await withNativeAbort(async () => {
        const transport = vi.fn<typeof fetch>(async (_url, options) => {
          expect(options?.signal).toBeInstanceOf(NativeAbortSignal);
          expect('throwIfAborted' in options!.signal!).toBe(false);
          expect('reason' in options!.signal!).toBe(false);
          return ok({ id: 'a' });
        });
        const { auth } = setup(transport);
        if (operation === 'restore') await auth.restore();
        else await auth.login(original);
        expect(auth.getSnapshot()).toMatchObject({ status: 'authed', user: { id: 'a' } });
        expect(transport).toHaveBeenCalledOnce();
      });
    },
  );

  it('rejects an already-aborted RN signal before dispatch with a portable AbortError', async () => {
    const transport = vi.fn<typeof fetch>();
    const { http } = setup(transport);
    const abort = new NativeAbortController();
    abort.abort();
    const result = await http
      .request('/api/me', { signal: abort.signal as unknown as AbortSignal })
      .catch((error: unknown) => error);
    expect(result).toBeInstanceOf(Error);
    expect(result).toMatchObject({ name: 'AbortError' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('migrates complete legacy pairs and never revives them after a logout tombstone', async () => {
    const values = new Map<string, string>([
      ['hq.access', original.accessToken],
      ['hq.refresh', original.refreshToken],
    ]);
    const keychain = {
      getItemAsync: async (key: string) => values.get(key) ?? null,
      setItemAsync: async (key: string, value: string) => {
        values.set(key, value);
      },
      deleteItemAsync: async () => {
        throw new Error('legacy cleanup failed');
      },
    };
    const sessions = createSessionStore(createSessionKeychain(keychain));
    expect((await sessions.snapshot()).tokens).toEqual(original);
    expect(JSON.parse(values.get('hq.session')!).tokens).toEqual(original);
    await sessions.end().completion;
    const restarted = createSessionStore(createSessionKeychain(keychain));
    expect((await restarted.snapshot()).tokens).toBeNull();
    expect(values.get('hq.refresh')).toBe(original.refreshToken);
  });

  it('preserves an offline startup and restores with the same credentials on retry', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(ok({ id: 'a' }));
    const { auth, disk, publish } = setup(transport);
    await auth.restore();
    expect(auth.getSnapshot().status).toBe('unavailable');
    expect(disk.value().tokens).toEqual(original);
    await auth.restore();
    expect(auth.getSnapshot()).toMatchObject({ status: 'authed', user: { id: 'a' } });
    expect(publish).toHaveBeenLastCalledWith({ id: 'a' });
  });

  it('recovers after keychain read rejection without losing the stored session', async () => {
    const { auth, disk } = setup(vi.fn<typeof fetch>().mockResolvedValue(ok({ id: 'a' })));
    disk.read.mockRejectedValueOnce(new Error('keychain locked'));
    await auth.restore();
    expect(auth.getSnapshot().status).toBe('unavailable');
    expect(disk.value().tokens).toEqual(original);
    await auth.restore();
    expect(auth.getSnapshot().status).toBe('authed');
  });

  it('writes a whole token pair and a logout tombstone in one storage operation each', async () => {
    const disk = storage(null);
    const sessions = createSessionStore(disk);
    await sessions.replace(original);
    expect(disk.write).toHaveBeenCalledTimes(1);
    expect(disk.value()).toEqual({ version: 1, tokens: original });
    const ended = sessions.end();
    expect(ended.tokens).toEqual(original);
    await ended.completion;
    expect(disk.value()).toEqual({ version: 1, tokens: null });
  });

  it('keeps sign-out blocked if persistence fails and allows retry to finish', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const { sessions, auth, disk } = setup(transport);
    await sessions.snapshot();
    disk.write.mockRejectedValueOnce(new Error('keychain locked'));
    await auth.logout();
    expect(auth.getSnapshot()).toMatchObject({
      status: 'unavailable',
      problem: 'logout',
      user: null,
    });
    expect(transport).toHaveBeenCalledWith(
      'https://example.test/auth/logout',
      expect.objectContaining({ body: JSON.stringify({ refreshToken: 'refresh-a' }) }),
    );
    await auth.logout();
    expect(auth.getSnapshot().status).toBe('guest');
    expect(disk.value().tokens).toBeNull();
  });

  it('does not publish a late login profile after logout', async () => {
    const profile = deferred<Response>();
    const started = deferred<void>();
    const transport: typeof fetch = async (url) => {
      if (String(url).endsWith('/auth/logout')) return new Response(null, { status: 204 });
      started.resolve();
      return profile.promise;
    };
    const { auth, publish, disk } = setup(transport);
    const login = auth.login(original);
    const settled = login.catch((error: unknown) => error);
    await started.promise;
    await auth.logout();
    profile.resolve(ok({ id: 'a' }));
    expect(await settled).toBeInstanceOf(SessionChanged);
    expect(auth.getSnapshot().status).toBe('guest');
    expect(publish).not.toHaveBeenCalledWith({ id: 'a' });
    expect(disk.value().tokens).toBeNull();
  });

  it('does not publish a late startup profile into a second login', async () => {
    const oldProfile = deferred<Response>();
    const started = deferred<void>();
    const transport: typeof fetch = async (_url, opts) => {
      if (new Headers(opts?.headers).get('authorization') === 'Bearer access-a') {
        started.resolve();
        return oldProfile.promise;
      }
      return ok({ id: 'b' });
    };
    const { auth, publish } = setup(transport);
    const restoring = auth.restore();
    await started.promise;
    await auth.login(second);
    oldProfile.resolve(ok({ id: 'a' }));
    await restoring;
    expect(auth.getSnapshot()).toMatchObject({ status: 'authed', user: { id: 'b' } });
    expect(publish).not.toHaveBeenCalledWith({ id: 'a' });
  });
});

describe('mobile session-bound refresh', () => {
  it('definitive refresh401 durably ends only the current session', async () => {
    const { auth, disk } = setup(async () => unauthorized());
    await auth.restore();
    expect(auth.getSnapshot()).toMatchObject({ status: 'guest', user: null });
    expect(disk.value().tokens).toBeNull();
  });

  it('preserves credentials after refresh network failure and retries a new flight', async () => {
    let calls = 0;
    const { http, disk } = setup(async (url, opts) => {
      if (String(url).endsWith('/auth/refresh')) {
        if (++calls === 1) throw new Error('offline refresh');
        return ok(rotated);
      }
      return new Headers(opts?.headers).get('authorization') === 'Bearer access-a2'
        ? ok({ id: 'a' })
        : unauthorized();
    });
    await expect(http.request('/api/me')).rejects.toThrow('offline refresh');
    expect(disk.value().tokens).toEqual(original);
    await expect(http.request('/api/me')).resolves.toEqual({ id: 'a' });
    expect(calls).toBe(2);
  });

  it('shares concurrent refresh and preserves each original idempotency header', async () => {
    const refreshing = deferred<Response>();
    const started = deferred<void>();
    const transport = vi.fn<typeof fetch>(async (url, opts) => {
      if (String(url).endsWith('/auth/refresh')) {
        started.resolve();
        return refreshing.promise;
      }
      return new Headers(opts?.headers).get('authorization') === 'Bearer access-a'
        ? unauthorized()
        : ok({ accepted: true });
    });
    const { http } = setup(transport);
    const first = http.request('/money', {
      method: 'POST',
      body: { amount: 1 },
      idempotencyKey: 'first-key',
    });
    const next = http.request('/money', {
      method: 'POST',
      body: { amount: 2 },
      idempotencyKey: 'next-key',
    });
    await started.promise;
    refreshing.resolve(ok(rotated));
    await Promise.all([first, next]);
    expect(
      transport.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh')),
    ).toHaveLength(1);
    const retries = transport.mock.calls.filter(
      ([, opts]) => new Headers(opts?.headers).get('authorization') === 'Bearer access-a2',
    );
    expect(
      retries.map(([, opts]) => new Headers(opts?.headers).get('idempotency-key')).sort(),
    ).toEqual(['first-key', 'next-key']);
  });

  it.each([429, 500, 503])(
    'retains credentials after refresh %s and clears the flight for later retry',
    async (status) => {
      let refreshCalls = 0;
      const transport: typeof fetch = async (url, opts) => {
        if (String(url).endsWith('/auth/refresh'))
          return ++refreshCalls === 1 ? ok({}, status) : ok(rotated);
        return new Headers(opts?.headers).get('authorization') === 'Bearer access-a'
          ? unauthorized()
          : ok({ id: 'a' });
      };
      const { http, disk } = setup(transport);
      await expect(http.request('/api/me')).rejects.toMatchObject({ status });
      expect(disk.value().tokens).toEqual(original);
      await expect(http.request('/api/me')).resolves.toEqual({ id: 'a' });
      expect(refreshCalls).toBe(2);
    },
  );

  it('clears failed refresh flights after storage rejection and persists the already rotated pair on retry', async () => {
    const transport = vi.fn<typeof fetch>(async (url, opts) => {
      if (String(url).endsWith('/auth/refresh')) return ok(rotated);
      return new Headers(opts?.headers).get('authorization') === 'Bearer access-a'
        ? unauthorized()
        : ok({ id: 'a' });
    });
    const { http, sessions, disk } = setup(transport);
    await sessions.snapshot();
    disk.write.mockRejectedValueOnce(new Error('write rejected'));
    await expect(http.request('/api/me')).rejects.toThrow('write rejected');
    await expect(http.request('/api/me')).resolves.toEqual({ id: 'a' });
    expect(disk.value().tokens).toEqual(rotated);
    expect(
      transport.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh')),
    ).toHaveLength(1);
  });

  it('fences logout during refresh and revokes the stale returned refresh token', async () => {
    const refreshing = deferred<Response>();
    const started = deferred<void>();
    const transport = vi.fn<typeof fetch>(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        started.resolve();
        return refreshing.promise;
      }
      if (String(url).endsWith('/auth/logout')) return new Response(null, { status: 204 });
      return unauthorized();
    });
    const { http, auth, disk } = setup(transport);
    const requested = http.request('/api/me').catch((error: unknown) => error);
    await started.promise;
    await auth.logout();
    refreshing.resolve(ok(rotated));
    expect(await requested).toBeInstanceOf(SessionChanged);
    expect(disk.value().tokens).toBeNull();
    expect(auth.getSnapshot().status).toBe('guest');
    const revocations = transport.mock.calls
      .filter(([url]) => String(url).endsWith('/auth/logout'))
      .map(([, opts]) => opts?.body);
    expect(revocations).toEqual([
      JSON.stringify({ refreshToken: 'refresh-a' }),
      JSON.stringify({ refreshToken: 'refresh-a2' }),
    ]);
  });

  it('ignores a stale refresh401 after second login, which can later refresh normally', async () => {
    const oldRefresh = deferred<Response>();
    const started = deferred<void>();
    const transport: typeof fetch = async (url, opts) => {
      if (String(url).endsWith('/auth/refresh')) {
        if (opts?.body === JSON.stringify({ refreshToken: 'refresh-a' })) {
          started.resolve();
          return oldRefresh.promise;
        }
        return ok({ accessToken: 'access-b2', refreshToken: 'refresh-b2' });
      }
      return new Headers(opts?.headers).get('authorization') === 'Bearer access-b2'
        ? ok({ id: 'b' })
        : unauthorized();
    };
    const { http, sessions, disk } = setup(transport);
    const invalidated = vi.fn();
    http.setUnauthorizedHandler(invalidated);
    const old = http.request('/api/me').catch((error: unknown) => error);
    await started.promise;
    await sessions.replace(second);
    oldRefresh.resolve(unauthorized());
    expect(await old).toBeInstanceOf(SessionChanged);
    expect(invalidated).not.toHaveBeenCalled();
    await expect(http.request('/api/me')).resolves.toEqual({ id: 'b' });
    expect(disk.value().tokens.refreshToken).toBe('refresh-b2');
  });

  it('handles missing tokens then a later login without leaving refresh blocked', async () => {
    const { http, sessions } = setup(async (url, opts) => {
      if (String(url).endsWith('/auth/refresh')) return ok(rotated);
      return new Headers(opts?.headers).get('authorization') === 'Bearer access-a2'
        ? ok({ id: 'a' })
        : unauthorized();
    });
    await sessions.end().completion;
    await expect(http.request('/api/me')).rejects.toMatchObject({ status: 401 });
    await sessions.replace(original);
    await expect(http.request('/api/me')).resolves.toEqual({ id: 'a' });
  });

  it('aborts startup through the refresh fetch and preserves credentials for retry', async () => {
    await withNativeAbort(async () => {
      let refreshSignal: AbortSignal | null = null;
      const transport: typeof fetch = async (url, opts) => {
        if (String(url).endsWith('/auth/refresh')) {
          refreshSignal = opts?.signal ?? null;
          return new Promise<Response>((_, reject) => {
            opts?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
              once: true,
            });
          });
        }
        return unauthorized();
      };
      const { sessions, http, disk } = setup(transport);
      const auth = createAuthSession({
        sessions,
        fetchMe: (signal) => http.request('/api/me', { signal }),
        revoke: http.revoke,
        publish: vi.fn(),
        timeoutMs: 20,
      });
      await auth.restore();
      expect((refreshSignal as AbortSignal | null)?.aborted).toBe(true);
      expect(auth.getSnapshot().status).toBe('unavailable');
      expect(disk.value().tokens).toEqual(original);
    });
  });
  it('distinguishes restricted accounts from connection failure without discarding the session', async () => {
    const { auth, disk } = setup(async () =>
      ok({ error: { code: 'ACCOUNT_INACTIVE', message: 'account is not active' } }, 403),
    );
    await auth.restore();
    expect(auth.getSnapshot()).toMatchObject({
      status: 'unavailable',
      problem: 'restricted',
      user: null,
    });
    expect(disk.value().tokens).toEqual(original);
  });
  it('shows account restriction discovered during a profile refresh and clears stale cached identity', async () => {
    let restricted = false;
    const { auth, disk, publish } = setup(async () =>
      restricted
        ? ok({ error: { code: 'ACCOUNT_INACTIVE', message: 'account is not active' } }, 403)
        : ok({ id: 'a' }),
    );
    await auth.restore();
    expect(auth.getSnapshot().status).toBe('authed');
    restricted = true;
    expect(await auth.refreshMe()).toBeNull();
    expect(auth.getSnapshot()).toEqual({
      status: 'unavailable',
      problem: 'restricted',
      user: null,
    });
    expect(publish).toHaveBeenLastCalledWith(null);
    expect(disk.value().tokens).toEqual(original);
  });
});
