import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from './Screen.js';
import { Avatar } from './Avatar.js';
import { Card } from './Card.js';
import { PreferenceRow } from './PreferenceRow.js';
import { Box, Text } from '../theme/restyle.js';
import { screenTokens } from '../theme/token-manager.js';
import { useAuth } from '../lib/auth-context.js';
import { openSupport } from '../lib/support.js';
import { clientTrustLabel } from '@hq/shared';
import { Badge } from './Badge.js';

export function ProfileView(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const name =
    user?.client?.displayName && user.client.displayName !== user.phone
      ? user.client.displayName
      : 'Your profile';
  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      <Screen scroll padding={false}>
        <Box style={{ paddingHorizontal: screenTokens.gutter, gap: screenTokens.sectionGap }}>
          <Box flexDirection="row" alignItems="center" gap="300">
            <Avatar name={name} size={68} imageUrl={user?.client?.avatarUrl} />
            <Box flex={1} gap="100">
              <Text variant="headingM" accessibilityRole="header">
                {name}
              </Text>
              {user?.client?.businessName ? (
                <Text variant="bodySm" color="inkMuted">
                  {user.client.businessName}
                </Text>
              ) : null}
              <Text variant="bodySm" color="inkMuted">
                {user?.phone}
              </Text>
              {clientTrustLabel(user?.client) ? (
                <Badge label={clientTrustLabel(user?.client)!} />
              ) : null}
            </Box>
          </Box>
          <Card>
            <Box gap="200">
              {user?.client ? (
                <PreferenceRow
                  icon="user"
                  label="View public profile"
                  onPress={() =>
                    router.push({
                      pathname: '/(modals)/client-profile',
                      params: { id: user.client!.id },
                    })
                  }
                />
              ) : null}
              {user?.client?.accountType === 'INDIVIDUAL' ? (
                <PreferenceRow
                  icon="briefcase"
                  label="Upgrade to a business account"
                  onPress={() => router.push('/(verification)/account-type')}
                />
              ) : null}
              <PreferenceRow
                icon="briefcase"
                label="My bookings"
                onPress={() => router.push('/(modals)/my-bookings')}
              />
              <PreferenceRow
                icon="settings"
                label="Account settings"
                onPress={() => router.push('/(modals)/account-settings')}
              />
              <PreferenceRow
                icon="bell"
                label="Notifications"
                onPress={() => router.push('/(modals)/notifications')}
              />
              <PreferenceRow
                icon="help-circle"
                label="Help & support"
                onPress={() => void openSupport()}
              />
              <PreferenceRow
                icon="log-out"
                label={signingOut ? 'Signing out…' : 'Sign out'}
                disabled={signingOut}
                onPress={() => {
                  setSigningOut(true);
                  void logout().finally(() => setSigningOut(false));
                }}
              />
            </Box>
          </Card>
        </Box>
      </Screen>
    </Box>
  );
}
