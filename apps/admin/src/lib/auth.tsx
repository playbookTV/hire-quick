import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { adminSession } from './api';
import { Btn } from '../components/ui';

interface AuthCtx {
  authed: boolean;
  requestOtp: (phone: string) => Promise<{ devCode?: string }>;
  verify: (phone: string, code: string) => Promise<void>;
  logout: () => void;
}
const Ctx = createContext<AuthCtx | null>(null);
export function useAuth(): AuthCtx {
  const context = useContext(Ctx);
  if (!context) throw new Error('useAuth outside provider');
  return context;
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(adminSession.subscribe, adminSession.getSnapshot);
  useEffect(() => { void adminSession.restore(); }, []);
  const value = useMemo<AuthCtx>(() => ({
    authed: state.status === 'authed', requestOtp: adminSession.requestOtp,
    verify: adminSession.verify, logout: () => { void adminSession.logout(); },
  }), [state.status]);
  let content = children;
  if (state.status === 'loading') content = <div className="grid min-h-screen place-items-center text-sm text-slate-500">Checking admin session…</div>;
  if (state.status === 'unavailable') content = <div className="grid min-h-screen place-items-center bg-slate-100">
    <div className="w-96 space-y-4 rounded-xl bg-white p-6 shadow">
      <h1 className="text-lg font-semibold">Session unavailable</h1>
      <p className="text-sm text-slate-600" role="alert">{state.message}</p>
      <div className="flex gap-2"><Btn onClick={() => { void adminSession.restore(); }}>Try again</Btn>
        <Btn variant="ghost" onClick={() => { void adminSession.logout(); }}>Sign out</Btn></div>
    </div>
  </div>;
  return <Ctx.Provider value={value}>{content}</Ctx.Provider>;
}
