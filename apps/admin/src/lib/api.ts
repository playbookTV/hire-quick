import { createAdminSession, type AdminRequestOptions } from './session';
export { AdminApiError, AdminSessionChanged } from './session';

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://prolific-love-production-2775.up.railway.app';

// Storage is accessed only inside lifecycle operations so denial is recoverable.
export const adminSession = createAdminSession({
  read: () => sessionStorage.getItem('hq_admin_session'),
  write: (value) => sessionStorage.setItem('hq_admin_session', value),
  discardLegacy: () => localStorage.removeItem('hq_admin_token'),
  fetch: (...args) => fetch(...args),
  baseUrl: API,
});
export function api<T>(path: string, opts: AdminRequestOptions = {}): Promise<T> {
  return adminSession.request<T>(path, opts);
}

export function naira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
}
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
}
