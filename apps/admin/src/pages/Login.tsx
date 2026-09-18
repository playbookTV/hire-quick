import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { Btn } from '../components/ui';
export function Login() {
  const { requestOtp, verify } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [hint, setHint] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function send() {
    if (busy) return;
    setErr('');
    setHint('');
    setBusy(true);
    try {
      const r = await requestOtp(phone.trim());
      setSent(true);
      setCode('');
      setHint(r.devCode ? `Staging code: ${r.devCode}` : 'Your sign-in code has been sent.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Couldn’t send your code. Try again.');
    } finally {
      setBusy(false);
    }
  }
  async function login() {
    if (busy) return;
    setErr('');
    setBusy(true);
    try {
      await verify(phone.trim(), code);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Couldn’t sign in. Try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-shell">
      <div className="login-card">
        <p className="eyebrow">HIREQUICK · OPERATIONS</p>
        <h1>Welcome back</h1>
        <p className="muted">Sign in to manage staff, bookings, and payments.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void (sent ? login() : send());
          }}
          className="form-stack"
          aria-busy={busy}
        >
          <label htmlFor="phone">Admin phone number</label>
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            required
            pattern="\+[1-9][0-9]{7,14}"
            aria-describedby="phone-hint"
            value={phone}
            readOnly={sent}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+234…"
          />
          <small id="phone-hint" className="muted">
            Include your country code, for example +234.
          </small>
          {sent && (
            <>
              <label htmlFor="code">Sign-in code</label>
              <input
                id="code"
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </>
          )}
          {hint && (
            <p role="status" className="notice">
              {hint}
            </p>
          )}
          {err && (
            <p role="alert" className="notice notice-error">
              {err}
            </p>
          )}
          <Btn type="submit" disabled={busy}>
            {busy ? 'Please wait…' : sent ? 'Sign in' : 'Send sign-in code'}
          </Btn>
          {sent && (
            <div className="action-row">
              <Btn variant="ghost" disabled={busy} onClick={() => void send()}>
                Resend code
              </Btn>
              <Btn
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setSent(false);
                  setCode('');
                  setHint('');
                  setErr('');
                }}
              >
                Change number
              </Btn>
            </div>
          )}
        </form>
      </div>
    </main>
  );
}
