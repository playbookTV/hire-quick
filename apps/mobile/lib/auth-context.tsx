/**
 * Session state for the whole app. Holds the hydrated `Me` (role + profile),
 * exposes `login`/`logout`, and re-hydrates from the keychain on cold start.
 * Guards (route _layouts) read `status`/`user` to decide redirects.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, setUnauthorizedHandler } from './client.js';
import { getTokens, saveTokens, clearTokens } from './tokens.js';
import { queryClient, queryKeys } from './query.js';
import type { Me, AuthResult } from './types.js';

type Status = 'loading' | 'authed' | 'guest';

interface AuthContextValue {
  status: Status;
  user: Me | null;
  /** Persist tokens from OTP verify, then hydrate the full profile. */
  login: (result: AuthResult) => Promise<Me>;
  logout: () => Promise<void>;
  /** Re-fetch `/api/me` (e.g. after completing a profile). */
  refreshMe: () => Promise<Me | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchMe(): Promise<Me> {
  const me = await api.get<Me>('/api/me');
  queryClient.setQueryData(queryKeys.me, me);
  return me;
}

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<Me | null>(null);
  const mounted = useRef(true);

  const goGuest = useCallback(() => {
    if (!mounted.current) return;
    setUser(null);
    setStatus('guest');
  }, []);

  // Force-logout when a refresh fails mid-session.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      queryClient.clear();
      goGuest();
    });
    return () => setUnauthorizedHandler(null);
  }, [goGuest]);

  // Cold-start hydration.
  useEffect(() => {
    mounted.current = true;
    void (async () => {
      const tokens = await getTokens();
      if (!tokens) {
        goGuest();
        return;
      }
      // Bound the cold-start probe so a hung /api/me resolves to guest instead of
      // trapping the splash on an infinite spinner (S16).
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const me = await Promise.race([
          fetchMe(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Auth check timed out')), 8000);
          }),
        ]);
        clearTimeout(timer);
        if (!mounted.current) return;
        setUser(me);
        setStatus('authed');
      } catch {
        clearTimeout(timer);
        await clearTokens();
        goGuest();
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, [goGuest]);

  const login = useCallback(async (result: AuthResult): Promise<Me> => {
    await saveTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
    const me = await fetchMe();
    setUser(me);
    setStatus('authed');
    return me;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await api.post('/auth/logout');
    } catch {
      // best-effort; tokens are discarded client-side regardless
    }
    await clearTokens();
    queryClient.clear();
    goGuest();
  }, [goGuest]);

  const refreshMe = useCallback(async (): Promise<Me | null> => {
    try {
      const me = await fetchMe();
      setUser(me);
      setStatus('authed');
      return me;
    } catch {
      return null;
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, logout, refreshMe }),
    [status, user, login, logout, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
