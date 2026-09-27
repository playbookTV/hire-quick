import { useLocalSearchParams, useRouter } from 'expo-router';
import { Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Button } from '../../components/Button.js';
import { Card } from '../../components/Card.js';
import { QueryState } from '../../components/QueryState.js';
import { StatusPill } from '../../components/StatusPill.js';
import { useMyInvitations, useSentInvitations } from '../../lib/hooks.js';
import { dateTime } from '../../lib/format.js';

function Received(): React.JSX.Element {
  const query = useMyInvitations();
  const router = useRouter();
  return (
    <QueryState query={query}>
      {(rows) => (
        <Box style={{ gap: 16 }}>
          {rows.length === 0 ? (
            <Text variant="body" color="inkMuted">
              No invitations yet. Invitations from clients will appear here.
            </Text>
          ) : null}
          {rows.map((row) => (
            <Card key={row.id}>
              <Box style={{ gap: 10 }}>
                <StatusPill status={row.status} />
                <Text variant="titleM">{row.event.title}</Text>
                <Text variant="bodySm">{dateTime(row.event.eventDate, row.event.startTime)}</Text>
                <Button
                  label="View invitation"
                  variant="secondary"
                  onPress={() =>
                    router.push({ pathname: '/(modals)/invitation', params: { id: row.id } })
                  }
                />
              </Box>
            </Card>
          ))}
        </Box>
      )}
    </QueryState>
  );
}
function Sent({ eventId }: { eventId: string }): React.JSX.Element {
  const query = useSentInvitations(eventId);
  const router = useRouter();
  return (
    <Box style={{ gap: 20 }}>
      <Text variant="body" color="inkMuted">
        Accepted invitations still need payment before a booking is confirmed.
      </Text>
      <Button label="Find staff to invite" onPress={() => router.push('/(client)/discover')} />
      <Button
        label="Review accepted invitations"
        variant="secondary"
        onPress={() => router.push({ pathname: '/(modals)/applications', params: { id: eventId } })}
      />
      <QueryState query={query}>
        {(rows) => (
          <Box style={{ gap: 16 }}>
            {rows.length === 0 ? (
              <Text variant="body" color="inkMuted">
                No invitations sent for this event.
              </Text>
            ) : null}
            {rows.map((row) => (
              <Card key={row.id}>
                <Box style={{ gap: 10 }}>
                  <Text variant="titleM">{row.usher.displayName ?? 'Usher'}</Text>
                  <StatusPill status={row.status} />
                  <Button
                    label="View profile"
                    variant="secondary"
                    onPress={() =>
                      router.push({
                        pathname: '/(modals)/staff-profile',
                        params: { id: row.usher.id },
                      })
                    }
                  />
                </Box>
              </Card>
            ))}
          </Box>
        )}
      </QueryState>
    </Box>
  );
}
export default function Invitations(): React.JSX.Element {
  const { event } = useLocalSearchParams<{ event?: string }>();
  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title={event ? 'Sent invitations' : 'Invitations'} showBack inset />
      <Screen scroll>{event ? <Sent eventId={event} /> : <Received />}</Screen>
    </Box>
  );
}
