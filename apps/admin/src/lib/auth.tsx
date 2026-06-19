import { createContext, useContext, useState, type ReactNode } from 'react';
import { api, setToken, getToken } from './api';

interface AuthCtx {
  authed: boolean;
  requestOtp: (phone: string) => Promise<{ devCode?: string }>;
  verify: (phone: string, code: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside provider');
  return v;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean>(Boolean(getToken()));

  const requestOtp = (phone: string) =>
    api<{ devCode?: string }>('/auth/otp/request', { method: 'POST', body: { phone } });

  const verify = async (phone: string, code: string): Promise<void> => {
    const r = await api<{ accessToken: string; user: { role: string } }>('/auth/otp/verify', {
      method: 'POST',
      body: { phone, code },
    });
    if (r.user.role !== 'ADMIN') throw new Error('This account is not an admin.');
    setToken(r.accessToken);
    setAuthed(true);
  };

  const logout = (): void => {
    setToken(null);
    setAuthed(false);
  };

  return <Ctx.Provider value={{ authed, requestOtp, verify, logout }}>{children}</Ctx.Provider>;
}
