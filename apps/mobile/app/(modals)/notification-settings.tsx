/**
 * Notification settings: the single push switch (OS permission + the account's
 * PUSH_NOTIFICATIONS consent) and the category switches inside it. Bookings and
 * payments stay on whenever push is on.
 */
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Switch } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NotificationPreferences } from '@hq/shared';
import { Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Button } from '../../components/Button.js';
import { Card } from '../../components/Card.js';
import { QueryState } from '../../components/QueryState.js';
import { useAuth } from '../../lib/auth-context.js';
import {
  pushConsentState,
  useConsents,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '../../lib/hooks.js';
import { queryKeys } from '../../lib/query.js';
import {
  disablePush,
  enablePush,
  pushPermission,
  pushUnsupported,
  type PushPermission,
} from '../../lib/push.js';
import { useToast } from '../../lib/toast.js';
import { userMessage } from '../../lib/api-error.js';

const CATEGORIES: {
  key: keyof NotificationPreferences;
  title: string;
  detail: string;
  usherOnly?: boolean;
}[] = [
  { key: 'jobAlerts', title: 'Job alerts', detail: 'New jobs posted in your state.', usherOnly: true },
  { key: 'reminders', title: 'Event reminders', detail: 'Before and during the events you’re part of.' },
  { key: 'messages', title: 'Messages', detail: 'New chat messages on your bookings.' },
];

export default function NotificationSettings(): React.JSX.Element {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const consents = useConsents();
  const preferences = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const [permission, setPermission] = useState<PushPermission>('undetermined');
  const [busy, setBusy] = useState(false);
  const unsupported = pushUnsupported();

  const refreshPermission = useCallback(() => {
    void pushPermission()
      .then(setPermission)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    refreshPermission();
    // Coming back from the phone's settings may have changed the permission.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshPermission();
    });
    return () => subscription.remove();
  }, [refreshPermission]);

  const consentOn = pushConsentState(consents.data) === 'granted';
  const pushOn = consentOn && permission === 'granted';

  const toggle = async (on: boolean): Promise<void> => {
    setBusy(true);
    try {
      if (on) {
        const result = await enablePush();
        if (result === 'unavailable')
          toast.error('This device can’t receive notifications yet.', 'Notifications unavailable');
      } else await disablePush();
    } catch (error) {
      toast.error(userMessage(error));
    } finally {
      setBusy(false);
      refreshPermission();
      void qc.invalidateQueries({ queryKey: queryKeys.consents });
    }
  };

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Notifications" showBack inset />
      <Screen scroll>
        <Box style={{ gap: 24 }}>
          <Card>
            <Box style={{ gap: 12 }}>
              <Box flexDirection="row" alignItems="center" style={{ gap: 12 }}>
                <Box flex={1} style={{ gap: 4 }}>
                  <Text variant="body">Push notifications</Text>
                  <Text variant="bodySm" color="inkMuted">
                    Bookings, payments and account updates are always included.
                  </Text>
                </Box>
                <Switch
                  accessibilityLabel="Push notifications"
                  value={pushOn}
                  disabled={busy || unsupported || !consents.isSuccess}
                  onValueChange={(on) => void toggle(on)}
                />
              </Box>
              {unsupported ? (
                <Text variant="bodySm" color="inkMuted">
                  Push notifications need the HireQuick app on a phone.
                </Text>
              ) : permission === 'denied' ? (
                <Box style={{ gap: 12 }}>
                  <Text variant="bodySm" color="inkMuted">
                    Notifications for HireQuick are off in your phone’s settings.
                  </Text>
                  <Button
                    label="Open phone settings"
                    variant="secondary"
                    onPress={() => void Linking.openSettings()}
                  />
                </Box>
              ) : null}
            </Box>
          </Card>
          <QueryState query={preferences}>
            {(prefs) => (
              <Card>
                <Box style={{ gap: 16 }}>
                  {CATEGORIES.filter((c) => !c.usherOnly || user?.role === 'USHER').map((c) => (
                    <Box key={c.key} flexDirection="row" alignItems="center" style={{ gap: 12 }}>
                      <Box flex={1} style={{ gap: 4 }}>
                        <Text variant="body">{c.title}</Text>
                        <Text variant="bodySm" color="inkMuted">
                          {c.detail}
                        </Text>
                      </Box>
                      <Switch
                        accessibilityLabel={c.title}
                        value={prefs[c.key]}
                        disabled={!pushOn || update.isPending}
                        onValueChange={(on) =>
                          update.mutate(
                            { [c.key]: on },
                            { onError: (e) => toast.error(userMessage(e)) },
                          )
                        }
                      />
                    </Box>
                  ))}
                </Box>
              </Card>
            )}
          </QueryState>
        </Box>
      </Screen>
    </Box>
  );
}
