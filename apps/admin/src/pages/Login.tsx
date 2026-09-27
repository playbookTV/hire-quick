import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { Btn } from '../components/ui';
export function Login() {
  const { requestOtp, verify } = useAuth();
  const [email, setEmail] = useState('');
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
      await requestOtp(email.trim().toLowerCase());
      setSent(true);
      setCode('');
      setHint('If this email has admin access, a sign-in code has been sent.');
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
      await verify(email.trim().toLowerCase(), code);
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
          <label htmlFor="email">Admin email address</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            aria-describedby="email-hint"
            value={email}
            readOnly={sent}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <small id="email-hint" className="muted">
            Use the email address linked to your admin account.
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
                Change email
              </Btn>
            </div>
          )}
        </form>
      </div>
    </main>
  );
}
