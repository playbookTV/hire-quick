import { useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { type ClientAccountType } from '@hq/shared';
import { Box, Text, useTheme } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Button } from '../../components/Button.js';
import { Banner } from '../../components/Banner.js';
import { Icon } from '../../components/Icon.js';
import { useAuth } from '../../lib/auth-context.js';
import { api } from '../../lib/client.js';
import { userMessage } from '../../lib/api-error.js';
import { openSupport } from '../../lib/support.js';

export default function AccountType() {
  const { user, refreshMe, logout } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const [choice, setChoice] = useState<ClientAccountType>('INDIVIDUAL');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (user?.role !== 'CLIENT') return <Redirect href="/" />;
  if (user.client?.accountType === 'BUSINESS')
    return <Redirect href="/(verification)/client-verification" />;
  async function submit() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api.put('/api/me/verification/account-type', { accountType: choice });
      await refreshMe();
      router.replace('/');
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Your account" showBack={user.client?.accountType === 'INDIVIDUAL'} inset />
      <Screen scroll>
        <Box style={{ gap: 24 }}>
          <Text variant="h1">Who are you hiring for?</Text>
          {(
            [
              [
                'INDIVIDUAL',
                'Individual',
                'Hire in your own name. Your identity must be verified.',
                'user',
              ],
              [
                'BUSINESS',
                'Business or organisation',
                'Verify your identity, business registration, and authority to represent it.',
                'briefcase',
              ],
            ] as const
          ).map(([value, title, description, icon]) => (
            <Pressable
              key={value}
              accessibilityRole="radio"
              aria-checked={choice === value}
              accessibilityState={{ checked: choice === value, disabled: busy }}
              disabled={busy}
              onPress={() => setChoice(value)}
              style={{
                borderWidth: choice === value ? 2 : 1,
                borderColor:
                  choice === value ? theme.colors.brandEmerald : theme.colors.borderDefault,
                borderRadius: 8,
                padding: 20,
                gap: 12,
              }}
            >
              <Box flexDirection="row" alignItems="center" style={{ gap: 12 }}>
                <Icon name={icon} size={24} />
                <Text variant="titleM" style={{ flex: 1 }}>
                  {title}
                </Text>
                <Icon name={choice === value ? 'check-circle' : 'circle'} size={20} />
              </Box>
              <Text variant="body" color="inkMuted">
                {description}
              </Text>
            </Pressable>
          ))}
          <Text variant="bodySm" color="inkMuted">
            Not registered as a business? Choose Individual. You can complete business verification
            later.
          </Text>
          {choice === 'BUSINESS' && user.client?.accountType === 'INDIVIDUAL' ? (
            <Banner
              tone="warning"
              message="After switching, you must complete business verification before hiring again. Your existing paid bookings remain available."
            />
          ) : null}
          {error ? <Banner tone="warning" message={error} /> : null}
          <Button label="Continue" loading={busy} onPress={() => void submit()} />
          <Button
            label="Manage existing paid bookings"
            variant="ghost"
            onPress={() => router.push('/(modals)/my-bookings')}
          />
          <Button
            label="Contact support"
            variant="ghost"
            onPress={() => {
              void openSupport('Please help me choose my client account type.');
            }}
          />
          <Button
            label="Privacy and account data"
            variant="ghost"
            onPress={() => router.push('/(modals)/privacy-data')}
          />
          <Button
            label="Sign out"
            variant="ghost"
            onPress={() => {
              void logout().catch((e) => setError(userMessage(e)));
            }}
          />
        </Box>
      </Screen>
    </Box>
  );
}
