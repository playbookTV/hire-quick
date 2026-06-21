/**
 * Choose Role — matches Figma `Client / 04 Choose Role` (20:151): AppBar +
 * Heading/L title + two icon OptionCards + Continue (follows the cards).
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
        <Box style={{ gap: 8 }} marginBottom="600">
          <Text variant="h1">How will you use HireQuick?</Text>
          <Text variant="body" color="inkMuted">
            Pick a role. Changing it later needs support.
          </Text>
        </Box>

        <Box style={{ gap: 20 }} marginBottom="600">
          <OptionCard
            title="I'm hiring staff"
            subtitle="Post events and book ushers"
            icon="calendar"
            selected={role === 'CLIENT'}
            onPress={() => setRole('CLIENT')}
          />
          <OptionCard
            title="I'm an usher"
            subtitle="Find work and get paid"
            icon="user"
            selected={role === 'USHER'}
            onPress={() => setRole('USHER')}
          />
        </Box>

        <Button
          label="Continue"
          disabled={!role}
          onPress={() => router.push({ pathname: '/(auth)/phone', params: { role: role ?? '' } })}
        />
      </Screen>
    </Box>
  );
}
