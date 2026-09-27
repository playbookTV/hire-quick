import { useRouter } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { Screen } from '../../components/Screen.js';
import { QuickActionCard } from '../../components/QuickActionCard.js';
import { SectionHeader } from '../../components/SectionHeader.js';
import { EventCard } from '../../components/EventCard.js';
import { StaffCard } from '../../components/StaffCard.js';
import { EmptyState } from '../../components/EmptyState.js';
import { Box, useTheme } from '../../theme/restyle.js';
import { HomeHeading } from '../../components/ScreenHeading.js';
import { screenTokens } from '../../theme/token-manager.js';
import { money } from '../../lib/format.js';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context.js';
import { useEvents, useUshers, useNotifications } from '../../lib/hooks.js';

export default function ClientHome(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const events = useEvents();
  const suggested = useUshers({ limit: 4 });
  const notif = useNotifications();
  const unread = notif.data?.unreadCount ?? 0;

  const fullName =
    user?.client?.displayName && user.client.displayName !== user.phone
      ? user.client.displayName
      : null;
  const firstName = fullName ? fullName.split(' ')[0] : 'there';
  const recent = (events.data ?? []).slice(0, 2);

  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      <Screen
        scroll
        padding={false}
        refreshing={events.isFetching || suggested.isFetching}
        onRefresh={() => {
          void events.refetch();
          void suggested.refetch();
        }}
      >
        <Box style={{ paddingHorizontal: screenTokens.gutter, gap: screenTokens.sectionGap }}>
          <HomeHeading
            name={firstName}
            unread={unread}
            onNotifications={() => router.push('/(modals)/notifications')}
          />

          {/* quick actions */}
          <Box flexDirection="row" style={{ gap: 8 }}>
            <QuickActionCard
              title="Create event"
              icon="plus"
              variant="primary"
              onPress={() => router.push('/(modals)/create-event')}
            />
            <QuickActionCard
              title="Browse staff"
              icon="search"
              onPress={() => router.push('/(client)/discover')}
            />
          </Box>

          {/* your events */}
          <Box>
            <SectionHeader
              title="Your events"
              actionLabel={recent.length ? 'See all' : undefined}
              onAction={recent.length ? () => router.push('/(client)/events') : undefined}
            />
            {events.isLoading ? (
              <Box paddingVertical="800" alignItems="center">
                <ActivityIndicator color={theme.colors.brandEmerald} />
              </Box>
            ) : events.isError ? (
              <EmptyState
                icon="alert-circle"
                title="Couldn’t load your events"
                subtitle="Check your connection and try again — your events and payments are safe."
                actionLabel="Try again"
                onAction={() => {
                  void events.refetch();
                }}
              />
            ) : recent.length === 0 ? (
              <EmptyState
                icon="calendar"
                title="No events yet"
                subtitle="Create your first event and we’ll help you staff it."
                actionLabel="Create event"
                onAction={() => router.push('/(modals)/create-event')}
              />
            ) : (
              <Box style={{ gap: 12 }}>
                {recent.map((e) => (
                  <EventCard
                    key={e.id}
                    event={e}
                    onPress={() => router.push(`/(client)/events/${e.id}`)}
                  />
                ))}
              </Box>
            )}
          </Box>

          {/* suggested staff */}
          {(suggested.data ?? []).length > 0 ? (
            <Box>
              <SectionHeader
                title="Suggested staff"
                actionLabel="See all"
                onAction={() => router.push('/(client)/discover')}
              />
              <Box style={{ gap: 16 }}>
                {(suggested.data ?? []).slice(0, 2).map((u) => (
                  <StaffCard
                    key={u.id}
                    name={u.displayName ?? 'Usher'}
                    avatarUrl={u.avatarUrl}
                    meta={`${u.ratingAvg.toFixed(1)} · ${u.completedJobsCount} jobs · ${u.city ?? 'Lagos'}`}
                    price={u.dayRateKobo ? money(u.dayRateKobo) : 'Rate on request'}
                    priceSuffix={u.dayRateKobo ? '/ day indicative' : ''}
                    verified={u.verificationStatus === 'VERIFIED'}
                    onPress={() =>
                      router.push({ pathname: '/(modals)/staff-profile', params: { id: u.id } })
                    }
                  />
                ))}
              </Box>
            </Box>
          ) : null}
        </Box>
      </Screen>
    </Box>
  );
}
