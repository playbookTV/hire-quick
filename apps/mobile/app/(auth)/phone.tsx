/**
 * Phone — matches Figma `Client / 02 Phone` (19:115): AppBar + Heading/L title +
 * a 🇳🇬 +234 prefixed phone input + "Send code". Normalizes to the API's
 * `^\+?\d{7,15}$`.
 */
import { useState } from 'react';
import { TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { UserRole } from '@hq/shared';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Button } from '../../components/Button.js';
import { StepIndicator } from '../../components/StepIndicator.js';
import { Box, Text, useTheme } from '../../theme/restyle.js';
import { fonts } from '../../theme/fonts.js';
import { useRequestOtp } from '../../lib/hooks.js';
import { nigerianPhone } from '../../lib/ui-state.js';
import { userMessage } from '../../lib/api-error.js';

export default function Phone(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const params = useLocalSearchParams<{ role?: string }>();
  const role = (params.role || undefined) as UserRole | undefined;

  const [local, setLocal] = useState('');
  const [error, setError] = useState<string | null>(null);
  const requestOtp = useRequestOtp();

  // Local digits → E.164 (+234, dropping a leading 0).
  const phone = nigerianPhone(local);
  const valid = phone !== null;

  const submit = async () => {
    if (!phone || requestOtp.isPending) return;
    setError(null);
    try {
      const res = await requestOtp.mutateAsync(phone);
      router.push({
        pathname: '/(auth)/otp',
        params: { phone, role: role ?? '', devCode: res.devCode ?? '' },
      });
    } catch (e) {
      setError(userMessage(e));
    }
  };

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar showBack />
      <Screen scroll>
        <Box marginBottom="500">
          <StepIndicator total={3} current={0} label="ACCOUNT SETUP" />
        </Box>
        <Box style={{ gap: 16 }} marginBottom="600">
          <Box style={{ gap: 8 }}>
            <Text variant="h1">What’s your number?</Text>
            <Text variant="body" color="inkMuted">
              We’ll text a 6-digit code to verify it.
            </Text>
          </Box>

          <Box
            flexDirection="row"
            alignItems="center"
            backgroundColor="bgSurface"
            borderRadius="md"
            style={{
              height: 56,
              paddingHorizontal: 16,
              gap: 12,
              borderWidth: 1.5,
              borderColor: theme.colors.borderStrong,
            }}
          >
            <Text variant="labelLg" color="inkStrong">
              🇳🇬 +234
            </Text>
            <Box style={{ width: 1, height: 24, backgroundColor: theme.colors.borderStrong }} />
            <TextInput
              value={local}
              onChangeText={setLocal}
              placeholder="801 234 5678"
              placeholderTextColor={theme.colors.inkFaint}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              accessibilityLabel="Phone number"
              returnKeyType="send"
              onSubmitEditing={() => {
                if (valid) void submit();
              }}
              autoFocus
              maxLength={24}
              style={{
                flex: 1,
                fontFamily: fonts.sansRegular,
                fontSize: 16,
                color: theme.colors.inkStrong,
                paddingVertical: 0,
              }}
            />
          </Box>

          <Text variant="bodySm" color={error ? 'statusDanger' : 'inkFaint'}>
            {error ??
              (local && !valid
                ? 'Enter a Nigerian number, for example 0801 234 5678 or +234 801 234 5678.'
                : 'Standard message rates may apply.')}
          </Text>
        </Box>

        <Button
          label="Send code"
          disabled={!valid}
          loading={requestOtp.isPending}
          onPress={() => void submit()}
        />
      </Screen>
    </Box>
  );
}
