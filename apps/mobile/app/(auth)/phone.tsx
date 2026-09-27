/** Figma A03 phone entry; normalizes Nigerian national or international input to E.164. */
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { UserRole } from '@hq/shared';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Button } from '../../components/Button.js';
import { Input } from '../../components/Input.js';
import { Box, Text } from '../../theme/restyle.js';
import { useRequestOtp } from '../../lib/hooks.js';
import { nigerianPhone } from '../../lib/ui-state.js';
import { userMessage } from '../../lib/api-error.js';

export default function Phone(): React.JSX.Element {
  const router = useRouter();
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
        <Box style={{ gap: 16 }} marginBottom="600">
          <Box style={{ gap: 8 }}>
            <Text variant="h1">What’s your number?</Text>
            <Text variant="body" color="inkMuted">
              We’ll send a 6-digit code to confirm it’s you.
            </Text>
          </Box>

          <Box gap="200">
            <Text variant="label" color="inkDefault">
              Phone number
            </Text>
            <Box flexDirection="row" alignItems="flex-start" gap="200">
              <Box
                minHeight={52}
                paddingHorizontal="500"
                paddingVertical="300"
                borderWidth={1.5}
                borderColor="borderControl"
                backgroundColor="bgSurface"
                borderRadius="md"
              >
                <Text variant="body">+234</Text>
              </Box>
              <Box flex={1}>
                <Input
                  value={local}
                  onChangeText={setLocal}
                  placeholder="803 123 4567"
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  autoComplete="tel"
                  accessibilityLabel="Phone number"
                  returnKeyType="send"
                  error={!!error}
                  onSubmitEditing={() => {
                    if (valid) void submit();
                  }}
                  autoFocus
                  maxLength={24}
                />
              </Box>
            </Box>
          </Box>

          <Text variant="bodySm" color={error ? 'statusDanger' : 'inkFaint'}>
            {error ??
              (local && !valid
                ? 'Enter a Nigerian number, for example 0801 234 5678 or +234 801 234 5678.'
                : 'Standard message rates may apply.')}
          </Text>
        </Box>

        <Box flex={1} minHeight={32} />
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
