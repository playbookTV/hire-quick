/**
 * Phone — request an OTP. Normalizes the number to the API's `^\+?\d{7,15}$`
 * shape, then advances to the OTP screen (carrying the dev code in dev).
 */
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { UserRole } from '@hq/shared';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Field } from '../../components/Field.js';
import { Input } from '../../components/Input.js';
import { Button } from '../../components/Button.js';
import { Box, Text } from '../../theme/restyle.js';
import { useRequestOtp } from '../../lib/hooks.js';
import { ApiError } from '../../lib/api-error.js';

/** Keep a single leading +, strip everything else that isn't a digit. */
function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith('+') ? '+' : '';
  return plus + trimmed.replace(/[^\d]/g, '');
}

export default function Phone(): React.JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ role?: string }>();
  const role = (params.role || undefined) as UserRole | undefined;

  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const requestOtp = useRequestOtp();

  const valid = /^\+?\d{7,15}$/.test(normalizePhone(phone));

  const submit = async () => {
    setError(null);
    const normalized = normalizePhone(phone);
    try {
      const res = await requestOtp.mutateAsync(normalized);
      router.push({
        pathname: '/(auth)/otp',
        params: { phone: normalized, role: role ?? '', devCode: res.devCode ?? '' },
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send code. Try again.');
    }
  };

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar showBack />
      <Screen scroll>
        <Text variant="h1" marginBottom="200">
          What’s your number?
        </Text>
        <Text variant="body" color="inkMuted" marginBottom="600">
          We’ll text you a 6-digit code to confirm it’s you.
        </Text>

        <Field label="Phone number" error={error ?? undefined}>
          <Input
            leftIcon="phone"
            placeholder="0801 234 5678"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            autoFocus
            error={!!error}
            maxLength={20}
          />
        </Field>

        <Box flex={1} />
        <Button label="Send code" disabled={!valid} loading={requestOtp.isPending} onPress={submit} />
      </Screen>
    </Box>
  );
}
