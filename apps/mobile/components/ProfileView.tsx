/**
 * ProfileView — shared by both role Profile tabs. Identity header + sign out.
 * Settings rows are placeholders for later phases.
 */
import { useState } from 'react';
import { Screen } from './Screen.js';
import { AppBar } from './AppBar.js';
import { Avatar } from './Avatar.js';
import { Card } from './Card.js';
import { Button } from './Button.js';
import { StatusPill } from './StatusPill.js';
import { Box, Text } from '../theme/restyle.js';
import { Icon, type IconName } from './Icon.js';
import { Pressable } from 'react-native';
import { useAuth } from '../lib/auth-context.js';
import { openSupport } from '../lib/support.js';

function Row({ icon, label, onPress }: Readonly<{ icon: IconName; label: string; onPress?: () => void }>): React.JSX.Element {
  const inner = (
    <Box flexDirection="row" alignItems="center" gap="300" paddingVertical="300">
      <Icon name={icon} size={18} color="inkMuted" />
      <Text variant="body" color="inkDefault" style={{ flex: 1 }}>
        {label}
      </Text>
      <Icon name="chevron-right" size={18} color="borderStrong" />
    </Box>
  );
  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      {inner}
    </Pressable>
  );
}

export function ProfileView(): React.JSX.Element {
  const { user, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const name =
    user?.client?.displayName && user.client.displayName !== user.phone
      ? user.client.displayName
      : user?.role === 'USHER'
        ? 'Usher'
        : 'Your profile';

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Profile" inset />
      <Screen scroll>
        <Box flexDirection="row" alignItems="center" gap="400" marginBottom="500">
          <Avatar name={name} size={64} />
          <Box flex={1}>
            <Text variant="h2">{name}</Text>
            <Text variant="bodySm" color="inkMuted" marginTop="100">
              {user?.phone}
            </Text>
            <Box marginTop="200">
              <StatusPill status="" label={user?.role === 'USHER' ? 'Usher' : 'Client'} />
            </Box>
          </Box>
        </Box>

        <Card padded>
          <Row icon="settings" label="Account settings" />
          <Box height={1} backgroundColor="borderDefault" />
          <Row icon="bell" label="Notifications" />
          <Box height={1} backgroundColor="borderDefault" />
          <Row icon="help-circle" label="Help & support" onPress={() => void openSupport()} />
        </Card>

        <Box flex={1} />
        <Box marginTop="600">
          <Pressable>
            <Button
              label="Sign out"
              variant="secondary"
              loading={signingOut}
              onPress={async () => {
                setSigningOut(true);
                await logout();
              }}
            />
          </Pressable>
        </Box>
      </Screen>
    </Box>
  );
}
