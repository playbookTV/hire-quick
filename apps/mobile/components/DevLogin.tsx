/**
 * Dev-only quick login for the seeded QA accounts. Runs the real OTP flow
 * (request → echoed devCode → verify → session) then lets the root index route
 * by role. Renders nothing in production builds (env.IS_DEV === __DEV__), and
 * requires the staging API's seeded QA login mode to be enabled.
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Box, Text } from '../theme/restyle.js';
import { Button } from './Button.js';
import { useRequestOtp, useVerifyOtp } from '../lib/hooks.js';
import { useAuth } from '../lib/auth-context.js';
import { env } from '../lib/env.js';
import { DEV_ACCOUNTS } from '../lib/dev-accounts.js';

export function DevLogin(): React.JSX.Element | null {
  const router = useRouter();
  const { login } = useAuth();
  const requestOtp = useRequestOtp();
  const verifyOtp = useVerifyOtp();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!env.IS_DEV) return null;

  const pick = async (phone: string): Promise<void> => {
    setBusy(phone);
    setError(null);
    try {
      const { devCode } = await requestOtp.mutateAsync(phone);
      if (!devCode) throw new Error('Quick login is unavailable for this account. Enable seeded QA login on the staging API, or enter the code sent to your phone.');
      const result = await verifyOtp.mutateAsync({ phone, code: devCode });
      await login(result);
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dev login failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Box
      style={{
        gap: 8,
        padding: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(14,18,27,0.14)',
        borderStyle: 'dashed',
      }}
    >
      <Text variant="label" color="inkMuted">
        DEV LOGIN · {env.API_URL.replace(/^https?:\/\//, '')}
      </Text>
      {DEV_ACCOUNTS.map((a) => (
        <Button
          key={a.phone}
          label={busy === a.phone ? 'Signing in…' : a.label}
          variant="secondary"
          size="md"
          loading={busy === a.phone}
          disabled={busy !== null}
          onPress={() => void pick(a.phone)}
        />
      ))}
      {error ? (
        <Text variant="bodySm" color="statusDanger">
          {error}
        </Text>
      ) : null}
    </Box>
  );
}
