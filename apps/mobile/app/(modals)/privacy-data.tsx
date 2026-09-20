import { useState, useRef } from 'react';
import { Share, Switch } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Button } from '../../components/Button.js';
import { Card } from '../../components/Card.js';
import { Input } from '../../components/Input.js';
import { QueryState } from '../../components/QueryState.js';
import { api, newIdempotencyKey } from '../../lib/client.js';
import { useAuth } from '../../lib/auth-context.js';
import { useToast } from '../../lib/toast.js';
import { userMessage } from '../../lib/api-error.js';
import { openSupport } from '../../lib/support.js';
type Consent = { purpose: 'PUSH_NOTIFICATIONS' | 'MARKETING_EMAIL' | 'SMS'; granted: boolean };
const LABELS: Record<Consent['purpose'], string> = {
  PUSH_NOTIFICATIONS: 'Push notification consent',
  MARKETING_EMAIL: 'Marketing email',
  SMS: 'SMS messages',
};
export default function PrivacyData(): React.JSX.Element {
  const { logout } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirmation, setConfirmation] = useState('');
  const key = useRef(newIdempotencyKey());
  const query = useQuery({
    queryKey: ['consents'],
    queryFn: () => api.get<Consent[]>('/api/me/consents'),
  });
  const consent = useMutation({
    mutationFn: (body: Consent) => api.post('/api/me/consents', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consents'] }),
    onError: (e) => toast.error(userMessage(e)),
  });
  const exportData = useMutation({
    mutationFn: async () => {
      const data = await api.get<unknown>('/api/me/export');
      await Share.share({ title: 'HireQuick data export', message: JSON.stringify(data, null, 2) });
    },
    onError: (e) => toast.error(userMessage(e)),
  });
  const erase = useMutation({
    mutationFn: () => api.post('/api/me/erase', undefined, { idempotencyKey: key.current }),
    onSuccess: async () => {
      await logout();
    },
    onError: (e) => toast.error(userMessage(e)),
  });
  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Privacy & data" showBack inset />
      <Screen scroll>
        <Box style={{ gap: 24 }}>
          <QueryState query={query}>
            {(rows) => (
              <Card>
                <Box style={{ gap: 16 }}>
                  {(Object.keys(LABELS) as Consent['purpose'][]).map((purpose) => (
                    <Box key={purpose} flexDirection="row" alignItems="center" style={{ gap: 12 }}>
                      <Text variant="body" style={{ flex: 1 }}>
                        {LABELS[purpose]}
                      </Text>
                      <Switch
                        accessibilityLabel={LABELS[purpose]}
                        value={rows.find((r) => r.purpose === purpose)?.granted ?? false}
                        disabled={consent.isPending}
                        onValueChange={(granted) => consent.mutate({ purpose, granted })}
                      />
                    </Box>
                  ))}
                  <Text variant="bodySm" color="inkMuted">
                    Consent is saved to your account. Push delivery also requires notification
                    permission and a registered device.
                  </Text>
                </Box>
              </Card>
            )}
          </QueryState>
          <Box style={{ gap: 12 }}>
            <Text variant="h2">Your data</Text>
            <Text variant="body">
              Export a copy of your account data. The export may contain personal information;
              choose a private destination in the share menu.
            </Text>
            <Button
              label={exportData.isPending ? 'Preparing export…' : 'Export my data'}
              variant="secondary"
              disabled={exportData.isPending}
              onPress={() => exportData.mutate()}
            />
          </Box>
          <Box style={{ gap: 12 }}>
            <Text variant="h2">Erase my account</Text>
            <Text variant="body">
              This removes personal details and ends access to this account. Financial records are
              retained. Active bookings, unresolved payments or wallet funds may need to be settled
              first.
            </Text>
            <Text variant="bodySm">Type ERASE to confirm.</Text>
            <Input
              value={confirmation}
              onChangeText={setConfirmation}
              autoCapitalize="characters"
              accessibilityLabel="Type ERASE to confirm account erasure"
            />
            <Button
              label={erase.isPending ? 'Erasing…' : 'Erase account permanently'}
              variant="danger"
              disabled={confirmation !== 'ERASE' || erase.isPending}
              onPress={() => erase.mutate()}
            />
          </Box>
          <Button
            label="Help with a privacy request"
            variant="ghost"
            onPress={() => {
              void openSupport('Hi HireQuick support, I need help with a privacy request.');
            }}
          />
        </Box>
      </Screen>
    </Box>
  );
}
