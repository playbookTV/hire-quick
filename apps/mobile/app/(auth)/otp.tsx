/**
 * OTP — verify the 6-digit code. On success, persist the session and move to
 * profile completion. On non-production APIs the server echoes the code
 * (`devCode`); when present we prefill it so the smoke test is one tap. The
 * server is the gate — production never echoes — so this is safe in release
 * builds pointed at staging.
 */
import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { UserRole } from '@hq/shared';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { StepIndicator } from '../../components/StepIndicator.js';
import { Field } from '../../components/Field.js';
import { Input } from '../../components/Input.js';
import { Button } from '../../components/Button.js';
import { Banner } from '../../components/Banner.js';
import { Box, Text } from '../../theme/restyle.js';
import { Pressable } from 'react-native';
import { useRequestOtp, useVerifyOtp } from '../../lib/hooks.js';
import { hapticSuccess, hapticError } from '../../lib/haptics.js';
import { useAuth } from '../../lib/auth-context.js';
import { userMessage } from '../../lib/api-error.js';
import { useToast } from '../../lib/toast.js';

const RESEND_COOLDOWN_S = 30;

export default function Otp(): React.JSX.Element {
  const router = useRouter();
  const { login } = useAuth();
  const params = useLocalSearchParams<{ phone?: string; role?: string; devCode?: string }>();
  const phone = params.phone ?? '';
  const role = (params.role || undefined) as UserRole | undefined;

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S); // a code was sent before navigating here
  const verify = useVerifyOtp();
  const requestOtp = useRequestOtp();
  const toast = useToast();

  // Prefill the echoed code when the server provides one (non-prod only).
  useEffect(() => {
    if (params.devCode) setCode(params.devCode);
  }, [params.devCode]);

  // Resend cooldown tick — prevents code-mashing (rate limits / invalidated codes) — S2.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async () => {
    setError(null);
    try {
      const result = await verify.mutateAsync({ phone, code, role });
      hapticSuccess();
      await login(result);
      router.replace('/(auth)/complete-profile');
    } catch (e) {
      hapticError();
      setError(userMessage(e));
    }
  };

  const resend = async () => {
    if (cooldown > 0 || requestOtp.isPending) return;
    setError(null);
    try {
      const res = await requestOtp.mutateAsync(phone);
      // Surface the freshly echoed code so the prefill stays in sync on staging.
      if (res.devCode) setCode(res.devCode);
      setCooldown(RESEND_COOLDOWN_S);
      toast.success('New code sent.');
    } catch {
      setError('Could not resend the code.');
    }
  };

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar showBack />
      <Screen scroll>
        <Box marginBottom="500">
          <StepIndicator total={3} current={1} label="ACCOUNT SETUP" />
        </Box>
        <Text variant="h1" marginBottom="200">
          Enter the code
        </Text>
        <Text variant="body" color="inkMuted" marginBottom="500">
          Sent to {phone}.
        </Text>

        {params.devCode ? (
          <Box marginBottom="400">
            <Banner tone="info" title="Test build" message={`Your code is ${params.devCode} — already filled in below.`} />
          </Box>
        ) : null}

        <Field label="6-digit code" error={error ?? undefined}>
          <Input
            placeholder="000000"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            importantForAutofill="yes"
            value={code}
            onChangeText={(t) => {
              if (error) setError(null);
              setCode(t.replace(/[^\d]/g, '').slice(0, 6));
            }}
            onSubmitEditing={() => {
              if (code.length === 6) void submit();
            }}
            error={!!error}
            maxLength={6}
            autoFocus
          />
        </Field>

        <Box marginTop="400" marginBottom="600" alignItems="flex-start">
          <Pressable
            onPress={() => void resend()}
            hitSlop={8}
            disabled={cooldown > 0 || requestOtp.isPending}
            accessibilityRole="button"
            accessibilityLabel={cooldown > 0 ? `Resend code in ${cooldown} seconds` : 'Resend code'}
            accessibilityState={{ disabled: cooldown > 0 || requestOtp.isPending }}
          >
            <Text variant="label" color={cooldown > 0 ? 'inkMuted' : 'brandEmerald'}>
              {requestOtp.isPending ? 'Sending…' : cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </Text>
          </Pressable>
        </Box>

        <Button
          label="Verify"
          disabled={code.length !== 6}
          loading={verify.isPending}
          onPress={() => void submit()}
        />
      </Screen>
    </Box>
  );
}
