/**
 * Conversation list — the body of both the client and usher Messages tabs.
 * Booking chats unlock once a booking is CONFIRMED, so the list is the user's
 * confirmed-or-later bookings (`useBookings`). Tapping opens the booking thread.
 * It reads the role from auth, so the same component serves both sides.
 */
import { useCallback, useState } from 'react';
import { ScrollView, RefreshControl, Pressable } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Text, useTheme } from '../theme/restyle.js';
import { Chip } from './Chip.js';
import { Input } from './Input.js';
import { Icon } from './Icon.js';
import { fonts } from '../theme/fonts.js';
import { filterConversations, conversationTitle } from '../lib/conversations.js';
import { Avatar } from './Avatar.js';
import { ScreenHeading } from './ScreenHeading.js';
import { screenTokens } from '../theme/token-manager.js';
import { SkeletonRow } from './Skeleton.js';
import { EmptyState } from './EmptyState.js';
import { AnimatedPressable } from './Pressable.js';
import { useBookings } from '../lib/hooks.js';
import { useAuth } from '../lib/auth-context.js';

export function ConversationList(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
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
  const allThreads = filterConversations(bookings.data ?? [], isUsher, false, '');
  const threads = filterConversations(allThreads, isUsher, unreadOnly, search);

  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: screenTokens.gutter,
          paddingTop: screenTokens.top,
          paddingBottom: screenTokens.bottom,
          gap: theme.spacing['600'],
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={bookings.isFetching}
            onRefresh={() => {
              void bookings.refetch();
            }}
          />
        }
      >
        <ScreenHeading
          title="Messages"
          size="large"
          right={
            <Pressable
              onPress={() => {
                setSearchOpen(!searchOpen);
                setSearch('');
              }}
              accessibilityRole="button"
              accessibilityLabel={searchOpen ? 'Close conversation search' : 'Search conversations'}
              accessibilityState={{ expanded: searchOpen }}
            >
              <Box
                width={screenTokens.touchTarget}
                height={screenTokens.touchTarget}
                borderRadius="pill"
                borderWidth={1}
                borderColor="borderDefault"
                backgroundColor="bgSurface"
                alignItems="center"
                justifyContent="center"
              >
                <Icon name={searchOpen ? 'x' : 'search'} size={20} color="inkStrong" />
              </Box>
            </Pressable>
          }
        />
        {searchOpen ? (
          <Input
            autoFocus
            accessibilityLabel="Search conversations"
            placeholder="Search names or events"
            leftIcon="search"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            returnKeyType="search"
          />
        ) : null}
        <Box flexDirection="row" flexWrap="wrap" gap="200">
          <Chip
            variant="tab"
            label="All messages"
            selected={!unreadOnly}
            onPress={() => setUnreadOnly(false)}
          />
          <Chip
            variant="tab"
            label="Unread"
            selected={unreadOnly}
            onPress={() => setUnreadOnly(true)}
          />
        </Box>
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
              title={
                allThreads.length === 0
                  ? 'No conversations yet'
                  : unreadOnly && !search.trim()
                    ? 'You’re all caught up'
                    : 'No matching conversations'
              }
              subtitle={
                allThreads.length === 0
                  ? 'Chat unlocks once a booking is confirmed — you’ll coordinate the day right here.'
                  : 'Try another search or switch to all messages.'
              }
            />
          </Box>
        ) : (
          <Box backgroundColor="bgSurface" borderRadius="lg" overflow="hidden">
            {threads.map((b, index) => {
              const title = conversationTitle(b, isUsher);
              const unread = (b.unreadCount ?? 0) > 0;
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
                      gap: theme.spacing['300'],
                      paddingHorizontal: theme.spacing['400'],
                    }}
                  >
                    <Avatar name={title} size={48} tone={unread ? 'unread' : 'muted'} />
                    <Box
                      flex={1}
                      gap="150"
                      paddingVertical="600"
                      borderBottomWidth={index === threads.length - 1 ? 0 : 1}
                      borderBottomColor="borderDefault"
                    >
                      <Box flexDirection="row" alignItems="center" gap="200">
                        <Text
                          variant="body"
                          color="inkStrong"
                          numberOfLines={1}
                          style={{
                            flex: 1,
                            fontFamily: unread ? fonts.sansBold : fonts.sansMedium,
                          }}
                        >
                          {title}
                        </Text>
                        {unread ? (
                          <Box
                            minWidth={24}
                            minHeight={24}
                            paddingHorizontal="150"
                            borderRadius="pill"
                            backgroundColor="brandAccent"
                            alignItems="center"
                            justifyContent="center"
                          >
                            <Text
                              variant="caption"
                              color="inkOnAccent"
                              style={{ fontFamily: fonts.sansBold }}
                            >
                              {b.unreadCount}
                            </Text>
                          </Box>
                        ) : null}
                      </Box>
                      <Text variant="bodySm" color="inkMuted" numberOfLines={2}>
                        {b.event?.title ?? 'Booking'}
                      </Text>
                    </Box>
                  </Box>
                </AnimatedPressable>
              );
            })}
          </Box>
        )}
        <Text variant="caption" textAlign="center">
          Chat opens once a booking is confirmed.
        </Text>
      </ScrollView>
    </Box>
  );
}
