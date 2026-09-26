import { useState } from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import type { UserRole } from '@hq/shared';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Button } from '../../components/Button.js';
import { Box, Text } from '../../theme/restyle.js';

export default function ChooseRole(): React.JSX.Element {
  const router = useRouter();
  const [role, setRole] = useState<UserRole | null>(null);
  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar showBack />
      <Screen scroll>
        <Box gap="400">
          <Text variant="h1" accessibilityRole="header">
            How will you use HireQuick?
          </Text>
          <Text variant="body" color="inkMuted">
            This sets up your account. Changing it later needs support.
          </Text>
          <Box gap="300" accessibilityRole="radiogroup">
            {(
              [
                {
                  value: 'CLIENT',
                  title: 'I’m hiring staff',
                  description: 'Create events and book verified ushers for them.',
                },
                {
                  value: 'USHER',
                  title: 'I’m an usher',
                  description: 'Find event work and get paid into your wallet.',
                },
              ] as const
            ).map((option) => (
              <Pressable
                key={option.value}
                onPress={() => setRole(option.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: role === option.value }}
              >
                <Box
                  padding="400"
                  borderWidth={role === option.value ? 2 : 1.5}
                  borderRadius="md"
                  gap="100"
                  backgroundColor={role === option.value ? 'brandAccentSubtle' : 'bgSurface'}
                  borderColor={role === option.value ? 'brandAccent' : 'borderControl'}
                >
                  <Text variant="labelLg">{option.title}</Text>
                  <Text variant="bodySm" color="inkDefault">
                    {option.description}
                  </Text>
                </Box>
              </Pressable>
            ))}
          </Box>
        </Box>
        <Box flex={1} minHeight={32} />
        <Button
          label="Continue"
          disabled={!role}
          onPress={() => router.push({ pathname: '/(auth)/phone', params: { role: role ?? '' } })}
        />
      </Screen>
    </Box>
  );
}
