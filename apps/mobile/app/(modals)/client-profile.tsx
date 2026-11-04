import { useLocalSearchParams } from 'expo-router';
import { clientTrustLabel } from '@hq/shared';
import { Box, Text } from '../../theme/restyle.js';
import { AppBar } from '../../components/AppBar.js';
import { Screen } from '../../components/Screen.js';
import { Avatar } from '../../components/Avatar.js';
import { Badge } from '../../components/Badge.js';
import { KeyValueRow } from '../../components/KeyValueRow.js';
import { QueryState } from '../../components/QueryState.js';
import { useClientProfile } from '../../lib/hooks.js';

export default function ClientProfile(): React.JSX.Element {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const profile = useClientProfile(id);
  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Client profile" showBack inset />
      <Screen scroll>
        <QueryState query={profile}>
          {(client) => (
            <Box gap="400">
              <Avatar
                name={client.businessName || client.displayName}
                imageUrl={client.avatarUrl}
                size={96}
              />
              <Text variant="h2">{client.businessName || client.displayName}</Text>
              {client.businessName ? (
                <Text variant="body">
                  {client.displayName}
                  {client.position ? ` · ${client.position}` : ''}
                </Text>
              ) : client.position ? (
                <Text variant="body">{client.position}</Text>
              ) : null}
              {clientTrustLabel(client) ? <Badge label={clientTrustLabel(client)!} /> : null}
              {client.city ? (
                <Text variant="bodySm" color="inkMuted">
                  {client.city}
                </Text>
              ) : null}
              <Text variant="body">
                {client.description || 'This client has not added an introduction yet.'}
              </Text>
              <KeyValueRow label="Events posted" value={String(client.jobsPosted ?? 0)} />
              <KeyValueRow label="Active events" value={String(client.activeJobs ?? 0)} />
              <KeyValueRow
                label="Rating"
                value={
                  client.ratingCount
                    ? `${client.ratingAvg.toFixed(1)} · ${client.ratingCount} reviews`
                    : 'No ratings yet'
                }
              />
            </Box>
          )}
        </QueryState>
      </Screen>
    </Box>
  );
}
