/**
 * Welcome — brand intro + entry into onboarding. Authed users are bounced to
 * their role home.
 */
import { Redirect, useRouter } from 'expo-router';
import { Screen } from '../../components/Screen.js';
import { Button } from '../../components/Button.js';
import { Box, Text } from '../../theme/restyle.js';
import { useAuth } from '../../lib/auth-context.js';
import { Loading } from '../../components/Loading.js';

export default function Welcome(): React.JSX.Element {
  const router = useRouter();
  const { status } = useAuth();

  if (status === 'loading') return <Loading />;
  if (status === 'authed') return <Redirect href="/" />;

  return (
    <Screen topInset>
      <Box flex={1} justifyContent="space-between" paddingVertical="800">
        <Box flex={1} justifyContent="center">
          <Text variant="overline" color="accentGoldStrong" marginBottom="200">
            HIREQUICK
          </Text>
          <Text variant="display">Premium event staff, booked in minutes.</Text>
          <Text variant="bodyLg" color="inkMuted" marginTop="400">
            Lagos’ trusted marketplace for ushers and hosts. Pay into escrow, release on verified
            attendance.
          </Text>
        </Box>

        <Box gap="300">
          <Button label="Get started" onPress={() => router.push('/(auth)/role')} />
          <Button
            label="I already have an account"
            variant="ghost"
            onPress={() => router.push('/(auth)/phone')}
          />
        </Box>
      </Box>
    </Screen>
  );
}
