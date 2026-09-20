/**
 * Notifications inbox — the persisted in-app feed (`GET /api/me/notifications`).
 * Tapping a row marks it read and, when it carries a deep-link target (currently
 * invitations), opens that screen. "Mark all read" clears the badge. Polls via
 * `useNotifications`; an OS push layer (expo-notifications + FCM) can later open
 * the same routes on tap.
 */
import { useRouter } from 'expo-router';
import { ScrollView, RefreshControl, Pressable } from 'react-native';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { AppBar } from '../../components/AppBar.js';
import { Loading } from '../../components/Loading.js';
import { EmptyState } from '../../components/EmptyState.js';
import { Icon } from '../../components/Icon.js';
import { AnimatedPressable } from '../../components/Pressable.js';
import type { IconName } from '../../components/Icon.js';
import { shadowSm } from '../../theme/shadows.js';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '../../lib/hooks.js';
import { formatDayLabel } from '../../lib/format.js';
import type { Notification } from '../../lib/types.js';

const ICON: Record<string, IconName> = {
  INVITATION_RECEIVED: 'mail',
  BOOKING_CONFIRMED: 'check-circle',
  PAYOUT_RELEASED: 'dollar-sign',
  DISPUTE_OPENED: 'alert-circle',
  NEW_MESSAGE: 'message-circle',
};

function Row({ item, onPress }: Readonly<{ item: Notification; onPress: () => void }>) {
  const theme = useTheme();
  const unread = !item.readAt;
  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${item.body}${unread ? '. Unread' : ''}`}
      style={[
        {
          flexDirection: 'row',
          gap: 12,
          alignItems: 'flex-start',
          backgroundColor: unread ? theme.colors.brandEmeraldTint : theme.colors.bgSurface,
          borderWidth: 1,
          borderColor: theme.colors.borderDefault,
          borderRadius: theme.borderRadii.lg,
          padding: 14,
        },
        shadowSm,
      ]}
    >
      <Box
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.bgCanvas,
        }}
      >
        <Icon
          name={ICON[item.type] ?? 'bell'}
          size={18}
          color={unread ? 'brandEmerald' : 'inkMuted'}
        />
      </Box>
      <Box flex={1} style={{ gap: 2 }}>
        <Box
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
          style={{ gap: 8 }}
        >
          <Text
            variant="label"
            style={{ fontSize: 15, flex: 1 }}
            color="inkStrong"
            numberOfLines={1}
          >
            {item.title}
          </Text>
          {unread ? (
            <Box
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: theme.colors.brandEmerald,
              }}
            />
          ) : null}
        </Box>
        <Text variant="bodySm" color="inkMuted" numberOfLines={2}>
          {item.body}
        </Text>
        <Text variant="bodySm" color="inkFaint">
          {formatDayLabel(item.createdAt)}
        </Text>
      </Box>
    </AnimatedPressable>
  );
}

export default function Notifications(): React.JSX.Element {
  const router = useRouter();
  const feed = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const data = feed.data;
  const rows = data?.notifications ?? [];

  const open = (n: Notification): void => {
    if (!n.readAt) markRead.mutate(n.id);
    if (n.targetType === 'booking' && n.targetId) {
      router.push({ pathname: '/(modals)/booking-details', params: { booking: n.targetId } });
    } else if (n.targetType === 'withdrawal' && n.targetId) {
      router.push({ pathname: '/(modals)/withdrawal-details', params: { id: n.targetId } });
    } else if (n.targetType === 'checkout' && n.targetId) {
      router.push({ pathname: '/(modals)/funds-held', params: { order: n.targetId } });
    } else if (n.targetType === 'invitation' && n.targetId) {
      router.push({ pathname: '/(modals)/invitation', params: { id: n.targetId } });
    } else if (n.targetType === 'event' && n.targetId) {
      // New-application notifications deep-link the client to the event (review applications).
      router.push({ pathname: '/(client)/events/[id]', params: { id: n.targetId } });
    }
  };

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar
        title="Notifications"
        showBack
        inset
        right={
          data && data.unreadCount > 0 ? (
            <Pressable
              onPress={() => markAll.mutate()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Mark all notifications read"
            >
              <Text variant="label" color="brandEmerald">
                Mark all read
              </Text>
            </Pressable>
          ) : undefined
        }
      />
      {feed.isLoading ? (
        <Loading />
      ) : feed.isError ? (
        <EmptyState
          icon="alert-circle"
          title="Couldn’t load notifications"
          subtitle="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void feed.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="bell"
          title="No notifications yet"
          subtitle="Invitations, bookings and payouts will show up here."
        />
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 24,
            gap: 10,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={feed.isFetching} onRefresh={() => void feed.refetch()} />
          }
        >
          {rows.map((n) => (
            <Row key={n.id} item={n} onPress={() => open(n)} />
          ))}
        </ScrollView>
      )}
    </Box>
  );
}
