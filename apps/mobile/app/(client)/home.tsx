/**
 * Client Home — matches Figma `Client / Home` (10:2): gold "WELCOME BACK"
 * overline + Fraunces greeting + Avatar; two QuickActionCards; a live "Your
 * events" section; and a "Suggested staff" StaffCardCompact row.
 */
import { useRouter } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { Screen } from '../../components/Screen.js';
import { QuickActionCard } from '../../components/QuickActionCard.js';
import { SectionHeader } from '../../components/SectionHeader.js';
import { EventCard } from '../../components/EventCard.js';
import { StaffCardCompact } from '../../components/StaffCardCompact.js';
import { EmptyState } from '../../components/EmptyState.js';
import { Avatar } from '../../components/Avatar.js';
import { Box, Text, useTheme } from '../../theme/restyle.js';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context.js';
import { useEvents, useUshers } from '../../lib/hooks.js';

export default function ClientHome(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const events = useEvents();
  const suggested = useUshers({ limit: 4 });

  const fullName = user?.client?.displayName && user.client.displayName !== user.phone ? user.client.displayName : null;
  const firstName = fullName ? fullName.split(' ')[0] : 'there';
  const recent = (events.data ?? []).slice(0, 3);

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
        <Box style={{ paddingHorizontal: 20, paddingTop: 16, gap: 24 }}>
          {/* greeting */}
          <Box flexDirection="row" alignItems="center" justifyContent="space-between">
            <Box style={{ gap: 2 }}>
              <Text variant="overline" color="accentGoldStrong" style={{ letterSpacing: 1.2 }}>
                WELCOME BACK
              </Text>
              <Text variant="h2">Hello, {firstName}</Text>
            </Box>
            <Avatar name={fullName ?? user?.phone} size={48} />
          </Box>

          {/* quick actions */}
          <Box flexDirection="row" style={{ gap: 16 }}>
            <QuickActionCard
              title="Create event"
              subtitle="Post a new role"
              icon="plus"
              variant="primary"
              onPress={() => router.push('/(modals)/create-event')}
            />
            <QuickActionCard
              title="Browse staff"
              subtitle="Invite directly"
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
                  <EventCard key={e.id} event={e} onPress={() => router.push(`/(client)/events/${e.id}`)} />
                ))}
              </Box>
            )}
          </Box>

          {/* suggested staff */}
          {(suggested.data ?? []).length > 0 ? (
            <Box>
              <SectionHeader title="Suggested staff" actionLabel="See all" onAction={() => router.push('/(client)/discover')} />
              <Box flexDirection="row" flexWrap="wrap" style={{ gap: 16 }}>
                {(suggested.data ?? []).slice(0, 2).map((u) => (
                  <StaffCardCompact
                    key={u.id}
                    name={u.displayName ?? 'Usher'}
                    avatarUrl={u.avatarUrl}
                    rating={`${u.ratingAvg.toFixed(1)} · ${u.completedJobsCount} jobs`}
                    price={u.verificationStatus === 'VERIFIED' ? 'Verified' : ''}
                    verified={u.verificationStatus === 'VERIFIED'}
                    onPress={() => router.push({ pathname: '/(modals)/staff-profile', params: { id: u.id } })}
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
