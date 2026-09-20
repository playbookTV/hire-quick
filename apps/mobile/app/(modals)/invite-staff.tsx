import { useLocalSearchParams, useRouter } from 'expo-router';
import { eventInstant } from '@hq/shared';
import { Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Button } from '../../components/Button.js';
import { Card } from '../../components/Card.js';
import { QueryState } from '../../components/QueryState.js';
import { useEvents, useUsher, useInviteStaff } from '../../lib/hooks.js';
import { useToast } from '../../lib/toast.js';
import { userMessage } from '../../lib/api-error.js';
import { dateTime } from '../../lib/format.js';

export default function InviteStaff(): React.JSX.Element {
  const { usher = '' } = useLocalSearchParams<{ usher?: string }>();
  const events = useEvents();
  const profile = useUsher(usher);
  const invite = useInviteStaff();
  const toast = useToast();
  const router = useRouter();
  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Invite to an event" showBack inset />
      <Screen scroll>
        <QueryState query={profile}>
          {(person) => (
            <Box style={{ gap: 20 }}>
              <Text variant="h2">Invite {person.displayName ?? 'this usher'}</Text>
              <Text variant="body" color="inkMuted">
                Choose an event. You can review their response in the event’s invitations.
              </Text>
              <QueryState query={events}>
                {(all) => {
                  const rows = all.filter(
                    (e) =>
                      ['OPEN', 'PARTIALLY_STAFFED'].includes(e.status) &&
                      (e.staffing?.available ?? 0) > 0 &&
                      eventInstant(e.eventDate, e.startTime).getTime() > Date.now(),
                  );
                  return (
                    <Box style={{ gap: 16 }}>
                      {rows.length === 0 ? (
                        <>
                          <Text variant="body">No upcoming events with open slots.</Text>
                          <Button
                            label="Create an event"
                            onPress={() => router.push('/(modals)/create-event')}
                          />
                        </>
                      ) : null}
                      {rows.map((e) => (
                        <Card key={e.id}>
                          <Box style={{ gap: 10 }}>
                            <Text variant="titleM">{e.title}</Text>
                            <Text variant="bodySm">{dateTime(e.eventDate, e.startTime)}</Text>
                            <Button
                              label={invite.isPending ? 'Sending…' : 'Send invitation'}
                              disabled={invite.isPending}
                              onPress={() =>
                                invite.mutate(
                                  { eventId: e.id, usherId: usher },
                                  {
                                    onError: (err) => toast.error(userMessage(err)),
                                    onSuccess: () => {
                                      toast.success('Invitation sent.');
                                      router.replace({
                                        pathname: '/(modals)/invitations',
                                        params: { event: e.id },
                                      });
                                    },
                                  },
                                )
                              }
                            />
                          </Box>
                        </Card>
                      ))}
                    </Box>
                  );
                }}
              </QueryState>
            </Box>
          )}
        </QueryState>
      </Screen>
    </Box>
  );
}
