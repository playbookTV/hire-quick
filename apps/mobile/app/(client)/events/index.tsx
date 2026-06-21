/**
 * Events list — all of the client's events (GET /api/events), pull-to-refresh,
 * with a create CTA in the AppBar and an empty state.
 */
import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, Pressable } from 'react-native';
import { Screen } from '../../../components/Screen.js';
import { AppBar } from '../../../components/AppBar.js';
import { EventCard } from '../../../components/EventCard.js';
import { EmptyState } from '../../../components/EmptyState.js';
import { Loading } from '../../../components/Loading.js';
import { Box } from '../../../theme/restyle.js';
import { Icon } from '../../../components/Icon.js';
import { useEvents } from '../../../lib/hooks.js';

export default function EventsList(): React.JSX.Element {
  const router = useRouter();
  const events = useEvents();

  const createBtn = (
    <Pressable onPress={() => router.push('/(modals)/create-event')} hitSlop={8}>
      <Icon name="plus" size={24} color="brandEmerald" />
    </Pressable>
  );

  if (events.isLoading) {
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar title="Events" inset right={createBtn} />
        <Loading />
      </Box>
    );
  }

  const data = events.data ?? [];

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Events" inset right={createBtn} />
      {data.length === 0 ? (
        <Screen>
          <Box flex={1} justifyContent="center">
            <EmptyState
              icon="calendar"
              title="No events yet"
              subtitle="Create an event to start booking staff."
              actionLabel="Create event"
              onAction={() => router.push('/(modals)/create-event')}
            />
          </Box>
        </Screen>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: 20, gap: 12 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={events.isFetching} onRefresh={() => events.refetch()} />}
          renderItem={({ item }) => (
            <EventCard event={item} onPress={() => router.push(`/(client)/events/${item.id}`)} />
          )}
        />
      )}
    </Box>
  );
}
