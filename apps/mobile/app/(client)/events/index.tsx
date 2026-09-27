import { useState } from 'react';
import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeading } from '../../../components/ScreenHeading.js';
import { Segmented } from '../../../components/Segmented.js';
import { EventCard } from '../../../components/EventCard.js';
import { EmptyState } from '../../../components/EmptyState.js';
import { SkeletonCard } from '../../../components/Skeleton.js';
import { Box } from '../../../theme/restyle.js';
import { screenTokens } from '../../../theme/token-manager.js';
import { Icon } from '../../../components/Icon.js';
import { useEvents } from '../../../lib/hooks.js';

type Tab = 'active' | 'draft' | 'past';
const tabs = [
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'past', label: 'Past' },
] as const;
export default function EventsList(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const events = useEvents();
  const [tab, setTab] = useState<Tab>('active');
  // Use authoritative lifecycle state, not a device clock, to classify events.
  const data = (events.data ?? []).filter((e) =>
    tab === 'draft'
      ? e.status === 'DRAFT'
      : tab === 'past'
        ? ['COMPLETED', 'CANCELLED'].includes(e.status)
        : !['DRAFT', 'COMPLETED', 'CANCELLED'].includes(e.status),
  );
  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      <FlatList
        data={data}
        keyExtractor={(e) => e.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: screenTokens.gutter,
          paddingTop: screenTokens.top,
          paddingBottom: screenTokens.bottom,
          gap: 12,
        }}
        refreshControl={
          <RefreshControl refreshing={events.isFetching} onRefresh={() => void events.refetch()} />
        }
        ListHeaderComponent={
          <Box gap="300">
            <ScreenHeading
              title="Events"
              right={
                <Pressable
                  onPress={() => router.push('/(modals)/create-event')}
                  accessibilityRole="button"
                  accessibilityLabel="Create event"
                  style={{
                    minWidth: 44,
                    minHeight: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="plus" size={24} color="inkStrong" />
                </Pressable>
              }
            />
            <Segmented options={tabs} value={tab} onChange={setTab} />
          </Box>
        }
        ListEmptyComponent={
          events.isLoading ? (
            <Box gap="300">
              {[0, 1, 2].map((i) => (
                <SkeletonCard key={i} lines={3} />
              ))}
            </Box>
          ) : events.isError ? (
            <EmptyState
              icon="alert-circle"
              title="Couldn’t load your events"
              subtitle="Check your connection and try again."
              actionLabel="Try again"
              onAction={() => void events.refetch()}
            />
          ) : (
            <EmptyState
              icon="calendar"
              title={
                tab === 'draft'
                  ? 'No drafts'
                  : tab === 'past'
                    ? 'No past events'
                    : 'No active events'
              }
              subtitle={
                tab === 'past'
                  ? 'Completed and cancelled events will appear here.'
                  : 'Create an event and start building your team.'
              }
              actionLabel={tab === 'past' ? undefined : 'Create event'}
              onAction={tab === 'past' ? undefined : () => router.push('/(modals)/create-event')}
            />
          )
        }
        renderItem={({ item }) => (
          <EventCard event={item} onPress={() => router.push(`/(client)/events/${item.id}`)} />
        )}
      />
    </Box>
  );
}
