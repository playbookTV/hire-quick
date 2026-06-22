/**
 * Conversation list — the body of both the client and usher Messages tabs.
 * Booking chats unlock once a booking is CONFIRMED, so the list is the user's
 * confirmed-or-later bookings (`useBookings`). Tapping opens the booking thread.
 * It reads the role from auth, so the same component serves both sides.
 */
import { Pressable, ScrollView, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Text } from '../theme/restyle.js';
import { Avatar } from './Avatar.js';
import { Loading } from './Loading.js';
import { useBookings } from '../lib/hooks.js';
import { useAuth } from '../lib/auth-context.js';

const CHATTABLE = new Set(['CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'PAID', 'DISPUTED']);

export function ConversationList(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isUsher = user?.role === 'USHER';
  const bookings = useBookings();
  const threads = (bookings.data ?? []).filter((b) => CHATTABLE.has(b.status));

  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 16 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={bookings.isFetching} onRefresh={() => { void bookings.refetch(); }} />}
      >
        <Text variant="h2">Messages</Text>
        {bookings.isLoading ? (
          <Loading />
        ) : threads.length === 0 ? (
          <Text variant="bodySm" color="inkMuted">
            No conversations yet. Chat unlocks once a booking is confirmed.
          </Text>
        ) : (
          <Box style={{ gap: 4 }}>
            {threads.map((b) => {
              const counterparty = isUsher ? b.event?.client?.displayName : b.usher?.displayName ?? b.usher?.user.phone;
              const title = counterparty ?? b.event?.title ?? `Booking · ${b.id.slice(0, 6)}`;
              return (
                <Pressable key={b.id} onPress={() => router.push({ pathname: '/(modals)/message-thread', params: { booking: b.id } })}>
                  <Box flexDirection="row" alignItems="center" borderRadius="md" style={{ gap: 12, paddingHorizontal: 8, paddingVertical: 12 }}>
                    <Avatar name={title} size={48} />
                    <Box flex={1} style={{ gap: 2 }}>
                      <Text variant="label" style={{ fontSize: 15, lineHeight: 20 }} color="inkStrong" numberOfLines={1}>
                        {title}
                      </Text>
                      <Text variant="bodySm" color="inkMuted" numberOfLines={1}>
                        {b.event?.title ?? 'Booking'} · {b.status.replace('_', ' ').toLowerCase()}
                      </Text>
                    </Box>
                  </Box>
                </Pressable>
              );
            })}
          </Box>
        )}
      </ScrollView>
    </Box>
  );
}
