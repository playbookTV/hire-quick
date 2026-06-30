import { useState } from 'react';
import { useAuth } from '../lib/auth';

export function Login() {
  const { requestOtp, verify } = useAuth();
  const [phone, setPhone] = useState('+2348000000001'); // seed admin
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [hint, setHint] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    setErr('');
    setBusy(true);
    try {
      const r = await requestOtp(phone);
      setSent(true);
      if (r.devCode) setHint(`Staging code: ${r.devCode}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(false);
    }
  }
  async function login() {
    setErr('');
    setBusy(true);
    try {
      await verify(phone, code);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-100">
      <div className="w-80 rounded-xl bg-white p-6 shadow">
        <h1 className="mb-1 text-lg font-semibold">HireQuick Admin</h1>
        <p className="mb-4 text-sm text-slate-500">Sign in with your admin phone.</p>
        <input
          className="mb-2 w-full rounded border px-3 py-2 text-sm"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+234…"
        />
        {sent && (
          <input
            className="mb-2 w-full rounded border px-3 py-2 text-sm"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6-digit code"
          />
        )}
        {hint && <p className="mb-2 text-xs text-emerald-600">{hint}</p>}
        {err && <p className="mb-2 text-xs text-red-600">{err}</p>}
        <button
          onClick={() => void (sent ? login() : send())}
          disabled={busy}
          className="w-full rounded bg-slate-900 py-2 text-sm text-white disabled:opacity-50"
        >
          {sent ? 'Sign in' : 'Send code'}
        </button>
      </div>
    </div>
  );
}
