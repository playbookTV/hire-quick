/**
 * OTP — verify the 6-digit code. On success, persist the session and move to
 * profile completion. In dev the API echoes the code (`devCode`), which we
 * prefill so the smoke test is one tap.
 */
import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { UserRole } from '@hq/shared';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Field } from '../../components/Field.js';
import { Input } from '../../components/Input.js';
import { Button } from '../../components/Button.js';
import { Banner } from '../../components/Banner.js';
import { Box, Text } from '../../theme/restyle.js';
import { Pressable } from 'react-native';
import { useRequestOtp, useVerifyOtp } from '../../lib/hooks.js';
import { useAuth } from '../../lib/auth-context.js';
import { ApiError } from '../../lib/api-error.js';
import { env } from '../../lib/env.js';

export default function Otp(): React.JSX.Element {
  const router = useRouter();
  const { login } = useAuth();
  const params = useLocalSearchParams<{ phone?: string; role?: string; devCode?: string }>();
  const phone = params.phone ?? '';
  const role = (params.role || undefined) as UserRole | undefined;

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const verify = useVerifyOtp();
  const requestOtp = useRequestOtp();

  // Dev convenience: prefill the echoed code.
  useEffect(() => {
    if (env.IS_DEV && params.devCode) setCode(params.devCode);
  }, [params.devCode]);

  const submit = async () => {
    setError(null);
    try {
      const result = await verify.mutateAsync({ phone, code, role });
      await login(result);
      router.replace('/(auth)/complete-profile');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Verification failed. Try again.');
    }
  };

  const resend = async () => {
    setError(null);
    try {
      await requestOtp.mutateAsync(phone);
    } catch {
      setError('Could not resend the code.');
    }
  };

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar showBack />
      <Screen scroll>
        <Text variant="h1" marginBottom="200">
          Enter the code
        </Text>
        <Text variant="body" color="inkMuted" marginBottom="500">
          Sent to {phone}.
        </Text>

        {env.IS_DEV && params.devCode ? (
          <Box marginBottom="400">
            <Banner tone="info" title="Dev mode" message={`Code prefilled: ${params.devCode}`} />
          </Box>
        ) : null}

        <Field label="6-digit code" error={error ?? undefined}>
          <Input
            placeholder="000000"
            keyboardType="number-pad"
            value={code}
            onChangeText={(t) => setCode(t.replace(/[^\d]/g, '').slice(0, 6))}
            error={!!error}
            maxLength={6}
            autoFocus
          />
        </Field>

        <Pressable onPress={resend} hitSlop={8} disabled={requestOtp.isPending}>
          <Text variant="label" color="brandEmerald">
            {requestOtp.isPending ? 'Sending…' : 'Resend code'}
          </Text>
        </Pressable>

        <Box flex={1} />
        <Button
          label="Verify"
          disabled={code.length !== 6}
          loading={verify.isPending}
          onPress={submit}
        />
      </Screen>
    </Box>
  );
}
