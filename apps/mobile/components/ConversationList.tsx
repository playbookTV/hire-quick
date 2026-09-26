/**
 * Conversation list — the body of both the client and usher Messages tabs.
 * Booking chats unlock once a booking is CONFIRMED, so the list is the user's
 * confirmed-or-later bookings (`useBookings`). Tapping opens the booking thread.
 * It reads the role from auth, so the same component serves both sides.
 */
import { useCallback } from 'react';
import { ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Text } from '../theme/restyle.js';
import { Avatar } from './Avatar.js';
import { ScreenHeading } from './ScreenHeading.js';
import { screenTokens } from '../theme/token-manager.js';
import { SkeletonRow } from './Skeleton.js';
import { EmptyState } from './EmptyState.js';
import { AnimatedPressable } from './Pressable.js';
import { useBookings } from '../lib/hooks.js';
import { useAuth } from '../lib/auth-context.js';

const CHATTABLE = new Set([
  'CONFIRMED',
  'CHECKED_IN',
  'COMPLETED',
  'PAID',
  'DISPUTED',
  'CANCELLED',
  'REFUNDED',
  'NO_SHOW',
]);

export function ConversationList(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isUsher = user?.role === 'USHER';
  const bookings = useBookings();
  const { refetch } = bookings;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const threads = (bookings.data ?? []).filter((b) => CHATTABLE.has(b.status));

  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: screenTokens.gutter,
          paddingTop: screenTokens.top,
          paddingBottom: 24,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={bookings.isFetching}
            onRefresh={() => {
              void bookings.refetch();
            }}
          />
        }
      >
        <ScreenHeading title="Messages" />
        <Text variant="bodySm" color="inkMuted">
          Chat opens once a booking is confirmed.
        </Text>
        {bookings.isLoading ? (
          <Box style={{ gap: 8 }}>
            {[0, 1, 2, 3].map((i) => (
              <SkeletonRow key={i} />
            ))}
          </Box>
        ) : bookings.isError ? (
          <EmptyState
            icon="alert-circle"
            title="Couldn’t load conversations"
            actionLabel="Try again"
            onAction={() => {
              void bookings.refetch();
            }}
          />
        ) : threads.length === 0 ? (
          <Box style={{ paddingTop: 48 }}>
            <EmptyState
              icon="message-circle"
              title="No conversations yet"
              subtitle="Chat unlocks once a booking is confirmed — you’ll coordinate the day right here."
            />
          </Box>
        ) : (
          <Box>
            {threads.map((b) => {
              const counterparty = isUsher
                ? b.event?.client?.displayName
                : (b.usher?.displayName ?? b.usher?.user?.phone);
              const title = counterparty ?? b.event?.title ?? `Booking · ${b.id.slice(0, 6)}`;
              return (
                <AnimatedPressable
                  key={b.id}
                  onPress={() =>
                    router.push({ pathname: '/(modals)/message-thread', params: { booking: b.id } })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Open chat with ${title}${b.unreadCount ? `, ${b.unreadCount} unread messages` : ''}`}
                >
                  <Box
                    flexDirection="row"
                    alignItems="center"
                    style={{
                      gap: 12,
                      paddingVertical: 20,
                    }}
                  >
                    <Avatar name={title} size={48} />
                    <Box flex={1} style={{ gap: 4 }}>
                      <Text variant="labelLg" color="inkStrong" numberOfLines={1}>
                        {title}
                      </Text>
                      <Text variant="bodySm" color="inkMuted" numberOfLines={1}>
                        {b.event?.title ?? 'Booking'}
                      </Text>
                    </Box>
                    {b.unreadCount ? (
                      <Box
                        minWidth={24}
                        minHeight={24}
                        paddingHorizontal="150"
                        borderRadius="pill"
                        backgroundColor="brandAccent"
                        alignItems="center"
                        justifyContent="center"
                      >
                        <Text variant="labelSm" color="inkOnAccent">
                          {b.unreadCount}
                        </Text>
                      </Box>
                    ) : null}
                  </Box>
                </AnimatedPressable>
              );
            })}
          </Box>
        )}
      </ScrollView>
    </Box>
  );
}
