/**
 * Choose Role — folds into the signup flow. The role is passed to OTP verify and
 * only takes effect when a new account is created (backend ignores it for
 * existing users).
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';
import type { UserRole } from '@hq/shared';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { OptionCard } from '../../components/OptionCard.js';
import { Button } from '../../components/Button.js';
import { Box, Text } from '../../theme/restyle.js';

export default function ChooseRole(): React.JSX.Element {
  const router = useRouter();
  const [role, setRole] = useState<UserRole | null>(null);

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar showBack />
      <Screen scroll>
        <Text variant="h1" marginBottom="200">
          How will you use HireQuick?
        </Text>
        <Text variant="body" color="inkMuted" marginBottom="600">
          You can’t change this later, so pick the one that fits.
        </Text>

        <Box gap="300">
          <OptionCard
            title="I’m hiring staff"
            subtitle="Post events and book verified ushers"
            icon="briefcase"
            selected={role === 'CLIENT'}
            onPress={() => setRole('CLIENT')}
          />
          <OptionCard
            title="I want to work"
            subtitle="Find gigs and get paid on attendance"
            icon="user"
            iconTone="gold"
            selected={role === 'USHER'}
            onPress={() => setRole('USHER')}
          />
        </Box>

        <Box flex={1} />
        <Button
          label="Continue"
          disabled={!role}
          onPress={() => router.push({ pathname: '/(auth)/phone', params: { role: role ?? '' } })}
        />
      </Screen>
    </Box>
  );
}
