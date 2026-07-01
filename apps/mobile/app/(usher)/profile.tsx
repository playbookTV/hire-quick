/**
 * Usher Profile tab — matches Figma `Usher / 07 Reliability` (51:210), the
 * Profile destination in the usher tab bar. Live: identity + stats from
 * `useAuth().user.usher`, the reliability score from `reliabilityScore`, and
 * received reviews from `useUsherReviews`.
 */
import { Pressable, ScrollView, RefreshControl, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { AvatarPicker } from '../../components/AvatarPicker.js';
import { PortfolioEditor } from '../../components/PortfolioEditor.js';
import { Icon } from '../../components/Icon.js';
import { SectionHeader } from '../../components/SectionHeader.js';
import { ProgressBar } from '../../components/ProgressBar.js';
import { ReviewCard } from '../../components/ReviewCard.js';
import { Button } from '../../components/Button.js';
import { shadowSm } from '../../theme/shadows.js';
import { useAuth } from '../../lib/auth-context.js';
import { useUsherReviews, useBookings } from '../../lib/hooks.js';
import { upcomingBookings } from '../../lib/bookings.js';
import { shortDate } from '../../lib/format.js';
import type { Theme } from '../../theme/theme.js';

function NavRow({ icon, label, sub, onPress }: Readonly<{ icon: React.ComponentProps<typeof Icon>['name']; label: string; sub?: string; onPress: () => void }>) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={sub ? `${label}. ${sub}` : label}>
      <Box flexDirection="row" alignItems="center" backgroundColor="bgSurface" borderWidth={1} borderColor="borderDefault" borderRadius="lg" padding="400" style={[{ gap: 12 }, shadowSm]}>
        <Icon name={icon} size={20} color="inkMuted" />
        <Box flex={1} style={{ gap: 2 }}>
          <Text variant="titleM">{label}</Text>
          {sub ? <Text variant="bodySm" color="inkMuted">{sub}</Text> : null}
        </Box>
        <Icon name="chevron-right" size={20} color="inkMuted" />
      </Box>
    </Pressable>
  );
}

const STATUS_LABEL: Record<string, string> = { VERIFIED: 'Verified', PENDING: 'Pending verification', REJECTED: 'Verification rejected' };

function Stat({ value, label, color }: { value: string; label: string; color: keyof Theme['colors'] }) {
  return (
    <Box flex={1} alignItems="center" style={{ gap: 2 }}>
      <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 22, lineHeight: 28, letterSpacing: -0.066 }} color={color}>
        {value}
      </Text>
      <Text variant="bodySm" color="inkMuted">
        {label}
      </Text>
    </Box>
  );
}

export default function UsherProfile(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const { user, logout } = useAuth();
  const usher = user?.usher;
  const reviews = useUsherReviews(usher?.id ?? '');
  const bookings = useBookings();
  const upcoming = upcomingBookings(bookings.data ?? []);

  const name = usher?.displayName ?? 'Your profile';
  const reliability = Math.round(usher?.reliabilityScore ?? 0);
  const years = usher?.yearsExperience ?? 0;

  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 16 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={reviews.isFetching} onRefresh={() => { void reviews.refetch(); }} />}
      >
        {/* identity */}
        <Box flexDirection="row" alignItems="center" style={{ gap: 12 }}>
          <AvatarPicker size={52} />
          <Box flex={1} style={{ gap: 2 }}>
            <Text variant="headingS">{name}</Text>
            <Text variant="bodySm" color={usher?.verificationStatus === 'VERIFIED' ? 'statusSuccess' : 'inkMuted'}>
              Usher · {STATUS_LABEL[usher?.verificationStatus ?? 'PENDING'] ?? 'Pending'}
              {years > 0 ? ` · ${years}y exp` : ''}
            </Text>
          </Box>
          <Pressable
            onPress={() => router.push('/(modals)/edit-profile')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: theme.borderRadii.pill,
              borderWidth: 1,
              borderColor: theme.colors.borderDefault,
              backgroundColor: theme.colors.bgSurface,
            }}
          >
            <Icon name="edit-2" size={14} color="brandEmerald" />
            <Text variant="label" style={{ fontSize: 13 }} color="brandEmerald">Edit</Text>
          </Pressable>
        </Box>

        {/* bio */}
        {usher?.bio ? (
          <Text variant="body" color="inkDefault">{usher.bio}</Text>
        ) : (
          <Pressable onPress={() => router.push('/(modals)/edit-profile')} accessibilityRole="button" accessibilityLabel="Add a bio — edit profile">
            <Text variant="bodySm" color="inkMuted">
              Add a short bio so clients know who they’re booking. <Text variant="bodySm" color="brandEmerald">Edit profile →</Text>
            </Text>
          </Pressable>
        )}

        {/* summary stats */}
        <Box flexDirection="row" backgroundColor="bgSurface" borderWidth={1} borderColor="borderDefault" borderRadius="lg" padding="400" style={shadowSm}>
          <Stat value={(usher?.ratingAvg ?? 0).toFixed(1)} label="Rating" color="accentGoldStrong" />
          <Stat value={String(usher?.completedJobsCount ?? 0)} label="Jobs done" color="inkStrong" />
          <Stat value={`${reliability}%`} label="Reliability" color="statusSuccess" />
        </Box>

        {/* upcoming jobs — accepted/booked work, surfaced here per usher feedback */}
        <Box style={{ gap: 10 }}>
          <SectionHeader
            title="Upcoming jobs"
            actionLabel={upcoming.length > 0 ? 'See all' : undefined}
            onAction={upcoming.length > 0 ? () => router.push('/(usher)/jobs') : undefined}
          />
          {upcoming.length === 0 ? (
            <Text variant="bodySm" color="inkMuted">
              No upcoming jobs yet — apply to jobs to fill your calendar.
            </Text>
          ) : (
            upcoming.slice(0, 2).map((b) => (
              <Pressable
                key={b.id}
                onPress={() => router.push('/(usher)/jobs')}
                accessibilityRole="button"
                accessibilityLabel={`${b.event?.title ?? 'Job'}${b.event ? ` on ${shortDate(b.event.eventDate)}` : ''}`}
              >
                <Box flexDirection="row" alignItems="center" backgroundColor="bgSurface" borderWidth={1} borderColor="borderDefault" borderRadius="lg" padding="400" style={[{ gap: 12 }, shadowSm]}>
                  <Icon name="calendar" size={20} color="brandEmerald" />
                  <Box flex={1} style={{ gap: 2 }}>
                    <Text variant="titleM" numberOfLines={1}>
                      {b.event?.title ?? 'Job'}
                    </Text>
                    <Text variant="bodySm" color="inkMuted">
                      {b.event ? shortDate(b.event.eventDate) : 'Date to be confirmed'}
                    </Text>
                  </Box>
                  <Icon name="chevron-right" size={20} color="inkMuted" />
                </Box>
              </Pressable>
            ))
          )}
        </Box>

        {/* quick links */}
        <Box style={{ gap: 10 }}>
          <NavRow icon="calendar" label="Availability" sub="Set the days you can work" onPress={() => router.push('/(usher)/calendar')} />
          <NavRow icon="credit-card" label="Wallet & withdrawals" sub="Balance, activity and bank payouts" onPress={() => router.push('/(usher)/wallet')} />
          {usher?.verificationStatus !== 'VERIFIED' ? (
            <NavRow icon="shield" label="Verify your identity" sub="Required before you can apply" onPress={() => router.push('/(verification)/id-verification')} />
          ) : null}
        </Box>

        {/* reliability score */}
        <Box backgroundColor="bgSurface" borderWidth={1} borderColor="borderDefault" borderRadius="lg" padding="400" style={{ gap: 12 }}>
          <Box flexDirection="row" alignItems="center" justifyContent="space-between">
            <Text variant="titleM">Reliability score</Text>
            <Text variant="amountM" color="statusSuccess">{reliability}%</Text>
          </Box>
          <ProgressBar progress={reliability / 100} color="statusSuccess" />
          <Text variant="bodySm" color="inkMuted">
            Based on on-time arrivals, cancellations and no-shows across your jobs.
          </Text>
        </Box>

        {/* portfolio — work photos clients see when deciding to hire */}
        <Box style={{ gap: 8 }}>
          <SectionHeader title="Work photos" />
          <Text variant="bodySm" color="inkMuted">Show clients your work. Add up to 5 photos.</Text>
          <PortfolioEditor />
        </Box>

        {/* protect standing */}
        <Box backgroundColor="brandEmeraldTintWeak" borderRadius="md" padding="400" style={{ gap: 4 }}>
          <Text variant="label" style={{ fontSize: 15 }} color="brandEmerald">
            Protect your standing
          </Text>
          <Text variant="bodySm" color="inkDefault">
            Cancelling within 24h of an event or not showing up lowers your reliability and ranking. Keep it high to win more invites.
          </Text>
        </Box>

        <SectionHeader title="Recent reviews" />
        {reviews.isLoading ? (
          <Text variant="bodySm" color="inkMuted">Loading your reviews…</Text>
        ) : reviews.isError ? (
          <Text variant="bodySm" color="statusDanger">Couldn’t load your reviews. Pull down to retry.</Text>
        ) : (reviews.data ?? []).length === 0 ? (
          <Text variant="bodySm" color="inkMuted">No reviews yet — they’ll appear after your first completed job.</Text>
        ) : (
          (reviews.data ?? []).map((rv) => (
            <ReviewCard key={rv.id} name={rv.reviewerName} date={shortDate(rv.createdAt)} comment={rv.comment ?? ''} rating={rv.rating} />
          ))
        )}

        <Button
          label="Sign out"
          variant="ghost"
          onPress={() =>
            Alert.alert('Sign out?', 'You’ll need your phone number and a new code to sign back in.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
            ])
          }
        />
      </ScrollView>
    </Box>
  );
}
