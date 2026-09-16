/** Auth UI over the tested session lifecycle coordinator. */
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { api, revokeRefreshToken, setUnauthorizedHandler } from './client.js';
import { sessionStore } from './tokens.js';
import { createAuthSession, type AuthState } from './auth-session.js';
import { queryClient, queryKeys } from './query.js';
import type { Me, AuthResult } from './types.js';
import { Screen } from '../components/Screen.js';
import { Loading } from '../components/Loading.js';
import { Button } from '../components/Button.js';
import { Box, Text } from '../theme/restyle.js';

interface AuthContextValue {
  status: AuthState<Me>['status'];
  user: Me | null;
  login: (result: AuthResult) => Promise<Me>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<Me | null>;
}
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [session] = useState(() => createAuthSession<Me>({
    sessions: sessionStore,
    fetchMe: (signal) => api.get<Me>('/api/me', { signal }),
    revoke: revokeRefreshToken,
    publish: (user) => {
      if (user) queryClient.setQueryData(queryKeys.me, user);
      else queryClient.clear();
    },
  }));
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useEffect(() => {
    setUnauthorizedHandler(session.invalidated);
    void session.restore();
    return () => { setUnauthorizedHandler(null); session.dispose(); };
  }, [session]);
  const value = useMemo<AuthContextValue>(() => ({
    status: state.status, user: state.user,
    login: session.login, logout: session.logout, refreshMe: session.refreshMe,
  }), [state.status, state.user, session]);

  let content = children;
  if (state.status === 'loading') content = <Loading />;
  if (state.status === 'unavailable') {
    const signingOut = state.problem === 'logout';
    content = <Screen topInset>
      <Box flex={1} justifyContent="center" style={{ gap: 16 }}>
        <Text variant="h2">{signingOut ? 'Sign out needs another try' : 'We couldn’t restore your session'}</Text>
        <Text variant="body" color="inkMuted">{signingOut
          ? 'We couldn’t finish signing out on this device. Try again.'
          : 'Check your connection and try again. Your saved sign-in is still on this device.'}</Text>
        <Button label="Try again" onPress={() => { void (signingOut ? session.logout() : session.restore()); }} />
        {!signingOut ? <Button label="Sign out" variant="ghost" onPress={() => { void session.logout(); }} /> : null}
      </Box>
    </Screen>;
  }
  return <AuthContext.Provider value={value}>{content}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within <AuthProvider>');
  return context;
}
