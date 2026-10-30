import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueries } from '@tanstack/react-query';
import { eventInstant } from '@hq/shared';
import { Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Button } from '../../components/Button.js';
import { Card } from '../../components/Card.js';
import { QueryState } from '../../components/QueryState.js';
import { useEvents, useInviteStaffBatch } from '../../lib/hooks.js';
import { useToast } from '../../lib/toast.js';
import { userMessage } from '../../lib/api-error.js';
import { dateTime } from '../../lib/format.js';
import { parseWorkerSelection } from '../../lib/hiring-selection.js';
import { api } from '../../lib/client.js';
import { queryKeys } from '../../lib/query.js';
import type { UsherListItem } from '../../lib/types.js';

export default function InviteStaff(): React.JSX.Element {
  const { usher, ushers, event } = useLocalSearchParams<{
    usher?: string;
    ushers?: string;
    event?: string;
  }>();
  const [selected, setSelected] = useState(() => parseWorkerSelection(ushers ?? usher));
  const profiles = useQueries({
    queries: selected.map((id) => ({
      queryKey: queryKeys.usher(id),
      queryFn: () => api.get<UsherListItem>(`/api/ushers/${id}`),
    })),
  });
  const events = useEvents();
  const invite = useInviteStaffBatch();
  const toast = useToast();
  const router = useRouter();
  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Invite to an event" showBack inset />
      <Screen scroll>
        <Box gap="400">
          <Text variant="h2">{selected.length} selected</Text>
          <Text variant="body" color="inkMuted">
            Review your team, then choose an event. Invitations require the worker’s acceptance
            before you can confirm a booking.
          </Text>
          {selected.map((id, index) => (
            <Card key={id}>
              <Box gap="200">
                <Text variant="titleM">
                  {profiles[index]?.data?.displayName ??
                    (profiles[index]?.isError ? 'Profile unavailable' : 'Loading profile…')}
                </Text>
                {profiles[index]?.isError ? (
                  <Button
                    label="Retry profile"
                    variant="ghost"
                    onPress={() => {
                      void profiles[index]?.refetch();
                    }}
                  />
                ) : null}
                <Button
                  label="Remove from selection"
                  variant="ghost"
                  disabled={invite.isPending}
                  onPress={() => setSelected((prev) => prev.filter((value) => value !== id))}
                />
              </Box>
            </Card>
          ))}
          {!selected.length ? (
            <Button label="Find staff" onPress={() => router.replace('/(client)/discover')} />
          ) : (
            <>
              <Button
                label="Create an event for this team"
                variant="secondary"
                disabled={invite.isPending}
                onPress={() =>
                  router.push({
                    pathname: '/(modals)/create-event',
                    params: { ushers: selected.join(',') },
                  })
                }
              />
              <QueryState query={events}>
                {(all) => {
                  const rows = all
                    .filter(
                      (e) =>
                        ['OPEN', 'PARTIALLY_STAFFED'].includes(e.status) &&
                        (e.staffing?.available ?? 0) > 0 &&
                        eventInstant(e.eventDate, e.startTime).getTime() > Date.now(),
                    )
                    .sort((a, b) => Number(b.id === event) - Number(a.id === event));
                  return (
                    <Box gap="400">
                      {!rows.length ? (
                        <Text variant="body">No upcoming events with open slots.</Text>
                      ) : null}
                      {rows.map((e) => (
                        <Card key={e.id}>
                          <Box gap="200">
                            <Text variant="titleM">
                              {e.title}
                              {e.id === event ? ' · Just created' : ''}
                            </Text>
                            <Text variant="bodySm">{dateTime(e.eventDate, e.startTime)}</Text>
                            <Button
                              label={`Send ${selected.length} invitation${selected.length === 1 ? '' : 's'}`}
                              disabled={
                                invite.isPending || profiles.some((p) => !p.data || p.isError)
                              }
                              loading={invite.isPending && invite.variables?.eventId === e.id}
                              onPress={() =>
                                invite.mutate(
                                  { eventId: e.id, usherIds: selected },
                                  {
                                    onError: (err) => toast.error(userMessage(err)),
                                    onSuccess: () => {
                                      toast.success('Invitations sent.');
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
            </>
          )}
        </Box>
      </Screen>
    </Box>
  );
}
