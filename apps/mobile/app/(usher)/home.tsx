import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable, ScrollView, RefreshControl } from 'react-native';
import { Box, Text } from '../../theme/restyle.js';
import { screenTokens } from '../../theme/token-manager.js';
import { HomeHeading } from '../../components/ScreenHeading.js';
import { SectionHeader } from '../../components/SectionHeader.js';
import { QueryState } from '../../components/QueryState.js';
import { Banner } from '../../components/Banner.js';
import { Button } from '../../components/Button.js';
import { Icon } from '../../components/Icon.js';
import { EarningsCard } from '../../components/EarningsCard.js';
import { Card } from '../../components/Card.js';
import { StatusPill } from '../../components/StatusPill.js';
import { EmptyState } from '../../components/EmptyState.js';
import { useAuth } from '../../lib/auth-context.js';
import { useWallet, useBookings, useNotifications } from '../../lib/hooks.js';
import { money, dateTime } from '../../lib/format.js';
import { bookingStartMs } from '../../lib/bookings.js';

export default function UsherHome(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const wallet = useWallet();
  const bookings = useBookings();
  const notifications = useNotifications();
  const upcoming = (bookings.data ?? [])
    .filter((b) => ['CONFIRMED', 'CHECKED_IN', 'PENDING_PAYMENT'].includes(b.status))
    .sort((a, b) => bookingStartMs(a) - bookingStartMs(b));
  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: screenTokens.gutter,
          paddingTop: screenTokens.top,
          paddingBottom: screenTokens.bottom,
          gap: screenTokens.sectionGap,
        }}
        refreshControl={
          <RefreshControl
            refreshing={wallet.isFetching || bookings.isFetching}
            onRefresh={() => {
              void wallet.refetch();
              void bookings.refetch();
              void notifications.refetch();
            }}
          />
        }
      >
        <HomeHeading
          name={user?.usher?.displayName ?? 'there'}
          unread={notifications.data?.unreadCount ?? 0}
          onNotifications={() => router.push('/(modals)/notifications')}
        />
        {user?.usher?.verificationStatus !== 'VERIFIED' ? (
          <Box gap="300">
            <Banner
              tone="brand"
              title="Verify your identity"
              message="Submit your ID and a selfie to unlock job applications and payouts."
            />
            <Button
              label="Check verification"
              variant="secondary"
              onPress={() => router.push('/(verification)/awaiting-approval')}
            />
          </Box>
        ) : null}
        <QueryState query={wallet} errorTitle="Couldn’t load your balance">
          {(balance) => (
            <Pressable
              onPress={() => router.push('/(usher)/wallet')}
              accessibilityRole="button"
              accessibilityLabel="View wallet and held funds"
            >
              <EarningsCard
                amount={balance.availableBalance}
                footer={
                  <Text variant="bodySm" color="moneyHeldOnElevated">
                    {money(balance.pendingEscrow)} held · view release details
                  </Text>
                }
              />
            </Pressable>
          )}
        </QueryState>
        <Box>
          <SectionHeader
            title="Upcoming jobs"
            actionLabel="See all"
            onAction={() => router.push('/(modals)/my-bookings')}
          />
          <QueryState query={bookings} errorTitle="Couldn’t load your jobs">
            {() =>
              upcoming.length === 0 ? (
                <EmptyState
                  icon="calendar"
                  title="No upcoming jobs"
                  subtitle="Find your next opportunity in Jobs."
                  actionLabel="Browse jobs"
                  onAction={() => router.push('/(usher)/jobs')}
                />
              ) : (
                <Box gap="400">
                  {upcoming.slice(0, 3).map((booking) => (
                    <Card
                      key={booking.id}
                      onPress={() =>
                        router.push({
                          pathname: '/(modals)/booking-details',
                          params: { booking: booking.id },
                        })
                      }
                    >
                      <Box gap="300">
                        <Text variant="headingS">{booking.event?.title ?? 'Booking'}</Text>
                        <Text variant="bodySm" color="inkMuted">
                          {booking.event
                            ? dateTime(booking.event.eventDate, booking.event.startTime)
                            : 'Date to be confirmed'}
                        </Text>
                        <Box flexDirection="row" flexWrap="wrap" alignItems="center" gap="200">
                          <StatusPill status={booking.status} />
                          <Text variant="bodySm" color="inkMuted">
                            {booking.status === 'PENDING_PAYMENT'
                              ? 'Client has not paid yet'
                              : booking.status === 'CHECKED_IN'
                                ? 'Arrival verified'
                                : 'View check-in details'}
                          </Text>
                        </Box>
                      </Box>
                    </Card>
                  ))}
                </Box>
              )
            }
          </QueryState>
        </Box>
        <Card onPress={() => router.push('/(usher)/calendar')}>
          <Box flexDirection="row" alignItems="center" gap="300">
            <Icon name="calendar" size={20} color="brandAccentText" />
            <Box flex={1} gap="100">
              <Text variant="labelLg">Availability</Text>
              <Text variant="bodySm" color="inkMuted">
                Set the days you can work
              </Text>
            </Box>
            <Icon name="chevron-right" size={18} color="inkMuted" />
          </Box>
        </Card>
      </ScrollView>
    </Box>
  );
}
