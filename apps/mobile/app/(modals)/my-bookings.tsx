import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Button } from '../../components/Button.js';
import { Card } from '../../components/Card.js';
import { QueryState } from '../../components/QueryState.js';
import { StatusPill } from '../../components/StatusPill.js';
import { useBookings } from '../../lib/hooks.js';
import { useAuth } from '../../lib/auth-context.js';
import { dateTime, money } from '../../lib/format.js';

const HISTORY = new Set(['PAID', 'CANCELLED', 'REFUNDED', 'NO_SHOW']);
export default function MyBookings(): React.JSX.Element {
  const query = useBookings();
  const { refetch } = query;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const { event } = useLocalSearchParams<{ event?: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [past, setPast] = useState(false);
  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="My bookings" showBack inset />
      <Screen scroll>
        <Box flexDirection="row" style={{ gap: 12, marginBottom: 20 }}>
          <Box flex={1}>
            <Button
              label="Active"
              variant={past ? 'secondary' : 'primary'}
              onPress={() => setPast(false)}
            />
          </Box>
          <Box flex={1}>
            <Button
              label="History"
              variant={past ? 'primary' : 'secondary'}
              onPress={() => setPast(true)}
            />
          </Box>
        </Box>
        <QueryState query={query}>
          {(bookings) => {
            const rows = bookings.filter(
              (b) => (!event || b.eventId === event) && HISTORY.has(b.status) === past,
            );
            return (
              <Box style={{ gap: 16 }}>
                {rows.length === 0 ? (
                  <Text variant="body" color="inkMuted">
                    {past
                      ? 'Completed and cancelled bookings will appear here.'
                      : 'No active bookings. A selection becomes a confirmed booking once payment is received.'}
                  </Text>
                ) : null}
                {rows.map((b) => (
                  <Card key={b.id}>
                    <Box style={{ gap: 10 }}>
                      <StatusPill status={b.status} />
                      <Text variant="titleM">{b.event?.title ?? 'Event booking'}</Text>
                      <Text variant="bodySm" color="inkMuted">
                        {user?.role === 'USHER'
                          ? b.event?.client?.displayName
                          : b.usher?.displayName}
                      </Text>
                      {b.event ? (
                        <Text variant="bodySm">
                          {dateTime(b.event.eventDate, b.event.startTime)}
                        </Text>
                      ) : null}
                      <Text variant="bodySm">Booking total · {money(b.amount)}</Text>
                      <Button
                        label={
                          b.status === 'PAID' && !b.myReview
                            ? 'View booking & review'
                            : 'View booking'
                        }
                        variant="secondary"
                        onPress={() =>
                          router.push({
                            pathname: '/(modals)/booking-details',
                            params: { booking: b.id },
                          })
                        }
                      />
                    </Box>
                  </Card>
                ))}
              </Box>
            );
          }}
        </QueryState>
      </Screen>
    </Box>
  );
}
