const API =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  'https://prolific-love-production-2775.up.railway.app';

let token: string | null = localStorage.getItem('hq_admin_token');

export function setToken(t: string | null): void {
  token = t;
  if (t) localStorage.setItem('hq_admin_token', t);
  else localStorage.removeItem('hq_admin_token');
}
export function getToken(): string | null {
  return token;
}

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export function naira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
}
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
}
