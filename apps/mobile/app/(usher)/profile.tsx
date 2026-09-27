import { ScrollView, RefreshControl, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Text } from '../../theme/restyle.js';
import { screenTokens } from '../../theme/token-manager.js';
import { AvatarPicker } from '../../components/AvatarPicker.js';
import { PortfolioEditor } from '../../components/PortfolioEditor.js';
import { SectionHeader } from '../../components/SectionHeader.js';
import { PreferenceRow } from '../../components/PreferenceRow.js';
import { ReviewCard } from '../../components/ReviewCard.js';
import { StatusPill } from '../../components/StatusPill.js';
import { Card } from '../../components/Card.js';
import { useAuth } from '../../lib/auth-context.js';
import { useUsherReviews, useBookings } from '../../lib/hooks.js';
import { upcomingBookings } from '../../lib/bookings.js';
import { shortDate } from '../../lib/format.js';
import { openSupport } from '../../lib/support.js';

export default function UsherProfile(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const usher = user?.usher;
  const reviews = useUsherReviews(usher?.id ?? '');
  const bookings = useBookings();
  const upcoming = upcomingBookings(bookings.data ?? []);
  const reliability = Math.round(usher?.reliabilityScore ?? 0);
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
            refreshing={reviews.isFetching}
            onRefresh={() => {
              void reviews.refetch();
              void bookings.refetch();
            }}
          />
        }
      >
        <Box flexDirection="row" alignItems="center" gap="300">
          <AvatarPicker size={96} />
          <Box flex={1} gap="100">
            <Text variant="headingM" accessibilityRole="header">
              {usher?.displayName ?? 'Your profile'}
            </Text>
            <StatusPill
              status={
                usher?.verificationStatus === 'VERIFIED'
                  ? 'VERIFIED'
                  : usher?.verificationStatus === 'REJECTED'
                    ? 'VERIFICATION_REJECTED'
                    : 'VERIFICATION_PENDING'
              }
            />
            {usher?.city || usher?.state ? (
              <Text variant="bodySm" color="inkMuted">
                {[usher.city, usher.state].filter(Boolean).join(', ')}
              </Text>
            ) : null}
          </Box>
        </Box>
        <Card>
          <Box flexDirection="row" flexWrap="wrap" justifyContent="space-around" gap="200">
            {[
              [(usher?.ratingAvg ?? 0).toFixed(1), 'Rating'],
              [String(usher?.completedJobsCount ?? 0), 'Jobs done'],
              [`${reliability}%`, 'Reliability'],
            ].map(([value, label]) => (
              <Box key={label} alignItems="center" gap="100">
                <Text variant="amount">{value}</Text>
                <Text variant="bodySm" color="inkMuted">
                  {label}
                </Text>
              </Box>
            ))}
          </Box>
        </Card>
        <Box gap="300" marginTop="200">
          <Text variant="headingS" color="inkMuted">
            About
          </Text>
          <Text variant="body" color="inkDefault">
            {usher?.bio || 'Add a short bio in Edit profile so clients know who they’re booking.'}
          </Text>
        </Box>
        <Box gap="200">
          <Text variant="headingS" color="inkMuted">
            Work photos
          </Text>
          <PortfolioEditor />
        </Box>
        <Card>
          <Box gap="200">
            <PreferenceRow
              icon="settings"
              label="Edit profile"
              onPress={() => router.push('/(modals)/edit-profile')}
            />
            <PreferenceRow
              icon="briefcase"
              label="My bookings"
              detail={bookings.data ? String(bookings.data.length) : undefined}
              onPress={() => router.push('/(modals)/my-bookings')}
            />
            <PreferenceRow
              icon="mail"
              label="Invitations"
              onPress={() => router.push('/(modals)/invitations')}
            />
            <PreferenceRow
              icon="calendar"
              label="Availability"
              onPress={() => router.push('/(usher)/calendar')}
            />
            <PreferenceRow
              icon="credit-card"
              label="Wallet"
              onPress={() => router.push('/(usher)/wallet')}
            />
            <PreferenceRow
              icon="sliders"
              label="Account settings"
              onPress={() => router.push('/(modals)/account-settings')}
            />
            {usher?.verificationStatus !== 'VERIFIED' ? (
              <PreferenceRow
                icon="shield"
                label="Verify your identity"
                onPress={() => router.push('/(verification)/awaiting-approval')}
              />
            ) : null}
            <PreferenceRow
              icon="help-circle"
              label="Help & support"
              onPress={() => void openSupport()}
            />
            <PreferenceRow
              icon="log-out"
              label="Sign out"
              onPress={() =>
                Alert.alert(
                  'Sign out?',
                  'You’ll need your phone number and a new code to sign back in.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
                  ],
                )
              }
            />
          </Box>
        </Card>
        {upcoming.length > 0 ? (
          <Box>
            <SectionHeader
              title="Upcoming jobs"
              actionLabel="See all"
              onAction={() => router.push('/(modals)/my-bookings')}
            />
            <Card>
              {upcoming.slice(0, 2).map((b) => (
                <PreferenceRow
                  key={b.id}
                  icon="calendar"
                  label={b.event?.title ?? 'Job'}
                  detail={b.event ? shortDate(b.event.eventDate) : undefined}
                  onPress={() =>
                    router.push({
                      pathname: '/(modals)/booking-details',
                      params: { booking: b.id },
                    })
                  }
                />
              ))}
            </Card>
          </Box>
        ) : null}
        <Text variant="bodySm" color="inkMuted">
          Reliability reflects on-time arrivals, cancellations and no-shows across your jobs.
        </Text>
        <Box gap="300">
          <SectionHeader title="Recent reviews" appearance="heading" />
          {reviews.isLoading ? (
            <Text variant="bodySm" color="inkMuted">
              Loading your reviews…
            </Text>
          ) : reviews.isError ? (
            <Text variant="bodySm" color="statusDanger">
              Couldn’t load reviews. Pull down to retry.
            </Text>
          ) : (reviews.data ?? []).length === 0 ? (
            <Text variant="bodySm" color="inkMuted">
              Reviews appear after your first completed job.
            </Text>
          ) : (
            reviews.data?.map((review) => (
              <ReviewCard
                key={review.id}
                name={review.reviewerName}
                date={shortDate(review.createdAt)}
                comment={review.comment ?? ''}
                rating={review.rating}
              />
            ))
          )}
        </Box>
      </ScrollView>
    </Box>
  );
}
