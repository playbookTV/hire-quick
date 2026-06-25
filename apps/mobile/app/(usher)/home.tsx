/**
 * Usher Dashboard — matches Figma `Usher / 01 Dashboard` (43:2): greeting, an
 * emerald "available to withdraw" card (Display/XL figure), and Upcoming jobs.
 * A verification banner shows until the usher is VERIFIED (the API gate). Live:
 * wallet from `useWallet`, upcoming work from `useBookings`.
 */
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable, ScrollView, RefreshControl } from 'react-native';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { SectionHeader } from '../../components/SectionHeader.js';
import { Banner } from '../../components/Banner.js';
import { Button } from '../../components/Button.js';
import { Icon } from '../../components/Icon.js';
import { EarningsCard } from '../../components/EarningsCard.js';
import { CategoryBadge } from '../../components/CategoryBadge.js';
import { AnimatedPressable } from '../../components/Pressable.js';
import { shadowSm } from '../../theme/shadows.js';
import { primitives } from '../../theme/primitives.js';
import { useAuth } from '../../lib/auth-context.js';
import { useWallet, useWalletActivity, useBookings } from '../../lib/hooks.js';
import { money, dateTime } from '../../lib/format.js';
import type { Booking, WalletActivity } from '../../lib/types.js';

/** Bucket credit activity into the last 7 calendar days (last slot = today) for the earnings sparkline. */
function weeklyEarnings(activity: WalletActivity[]): { values: number[]; total: number } {
  const days = 7;
  const buckets = new Array<number>(days).fill(0);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  for (const a of activity) {
    if (a.type !== 'credit') continue;
    const d = new Date(a.createdAt);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayDiff = Math.floor((startOfToday - dayStart) / 86_400_000);
    if (dayDiff >= 0 && dayDiff < days) buckets[days - 1 - dayDiff] += a.amount;
  }
  return { values: buckets, total: buckets.reduce((s, v) => s + v, 0) };
}

/** Time-aware greeting — "GOOD MORNING" at 8pm read as robotic (critique). */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'GOOD MORNING';
  if (h < 17) return 'GOOD AFTERNOON';
  return 'GOOD EVENING';
}

const BOOKING_LABEL: Record<string, { label: string; tone: 'success' | 'gold' }> = {
  CONFIRMED: { label: 'Confirmed', tone: 'success' },
  CHECKED_IN: { label: 'Checked in', tone: 'success' },
  PAID: { label: 'Paid', tone: 'success' },
  PENDING_PAYMENT: { label: 'Pending', tone: 'gold' },
};

function JobRow({ booking, onPress }: Readonly<{ booking: Booking; onPress: () => void }>) {
  const theme = useTheme();
  const meta = BOOKING_LABEL[booking.status] ?? { label: booking.status, tone: 'gold' as const };
  const success = meta.tone === 'success';
  // CONFIRMED/CHECKED_IN bookings open the check-in screen; the chevron signals it.
  const actionable = booking.status === 'CONFIRMED' || booking.status === 'CHECKED_IN';
  return (
    <AnimatedPressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${booking.event?.title ?? 'Booking'}, ${meta.label}. ${actionable ? 'Tap to check in.' : ''}`}>
      <Box backgroundColor="bgSurface" borderWidth={1} borderColor="borderDefault" borderRadius="lg" padding="400" style={[{ gap: 8 }, shadowSm]}>
        <Box flexDirection="row" alignItems="center" justifyContent="space-between">
          <Text variant="titleM" style={{ flex: 1 }} numberOfLines={1}>{booking.event?.title ?? 'Booking'}</Text>
          <Box style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: theme.borderRadii.pill, backgroundColor: success ? theme.colors.statusSuccessTint : theme.colors.accentGoldTint }}>
            <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, lineHeight: 16, letterSpacing: 0.2 }} color={success ? 'statusSuccess' : 'accentGoldStrong'}>
              {meta.label}
            </Text>
          </Box>
        </Box>
        {booking.event?.category ? <CategoryBadge category={booking.event.category} size="sm" /> : null}
        {booking.event ? (
          <Box flexDirection="row" alignItems="center" style={{ gap: 8 }}>
            <Icon name="calendar" size={16} color="inkMuted" />
            <Text variant="bodySm" color="inkMuted">
              {dateTime(booking.event.eventDate, booking.event.startTime)}
            </Text>
          </Box>
        ) : null}
        <Box flexDirection="row" alignItems="center" justifyContent="space-between">
          <Box flexDirection="row" alignItems="baseline" style={{ gap: 4 }}>
            <Text variant="bodySm" color="inkMuted">You’ll earn</Text>
            <Text variant="amountM" color="brandEmerald">{money(booking.amount)}</Text>
          </Box>
          {actionable ? (
            <Box flexDirection="row" alignItems="center" style={{ gap: 2 }}>
              <Text variant="label" color="brandEmerald">{booking.status === 'CHECKED_IN' ? 'View' : 'Check in'}</Text>
              <Icon name="chevron-right" size={18} color="brandEmerald" />
            </Box>
          ) : null}
        </Box>
      </Box>
    </AnimatedPressable>
  );
}

export default function UsherHome(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const verified = user?.usher?.verificationStatus === 'VERIFIED';
  const wallet = useWallet();
  const activity = useWalletActivity();
  const weekly = weeklyEarnings(activity.data ?? []);
  const bookings = useBookings();
  const name = user?.usher?.displayName ?? 'there';
  const initial = name.trim().charAt(0).toUpperCase() || 'U';
  const upcoming = (bookings.data ?? []).filter((b) => b.status !== 'PAID' && b.status !== 'CANCELLED');

  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 20 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={wallet.isFetching || activity.isFetching || bookings.isFetching}
            onRefresh={() => {
              void wallet.refetch();
              void activity.refetch();
              void bookings.refetch();
            }}
          />
        }
      >
        {/* greeting */}
        <Box flexDirection="row" alignItems="center" justifyContent="space-between">
          <Box style={{ gap: 2 }}>
            <Text variant="overline" color="accentGoldStrong" style={{ letterSpacing: 1.2 }}>
              {greeting()}
            </Text>
            <Text variant="h2">Hi {name}</Text>
          </Box>
          <Box style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandEmeraldTint }}>
            <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: theme.colors.brandEmerald }}>{initial}</Text>
          </Box>
        </Box>

        {!verified ? (
          <Box style={{ gap: 12 }}>
            <Banner tone="brand" title="Verify your identity" message="Submit your ID and a selfie to unlock job applications and payouts." />
            <Button label="Start verification" variant="secondary" onPress={() => router.push('/(verification)/profile-setup')} />
          </Box>
        ) : null}

        {/* earnings */}
        <EarningsCard
          amount={wallet.data?.availableBalance ?? 0}
          size="md"
          weekly={weekly}
          footer={
          <Box flexDirection="row" alignItems="center" justifyContent="space-between">
            <Pressable
              onPress={() => router.push('/(usher)/wallet')}
              accessibilityRole="button"
              accessibilityLabel={`${money(wallet.data?.pendingEscrow ?? 0)} held in escrow. View details.`}
              hitSlop={6}
            >
              <Box flexDirection="row" alignItems="center" style={{ gap: 4 }}>
                <Icon name="shield" size={16} color="inverseInk" />
                <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, lineHeight: 18, color: primitives.emerald[100] }}>
                  {money(wallet.data?.pendingEscrow ?? 0)} held · released after each event
                </Text>
              </Box>
            </Pressable>
            <Pressable
              onPress={() => router.push('/(usher)/wallet')}
              accessibilityRole="button"
              accessibilityLabel="Withdraw"
            >
              <Box backgroundColor="bgSurface" borderRadius="pill" style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
                <Text variant="label" style={{ fontSize: 13 }} color="brandEmerald">
                  Withdraw
                </Text>
              </Box>
            </Pressable>
          </Box>
          }
        />

        {/* availability shortcut (Calendar lives off the tab bar now) */}
        <Pressable onPress={() => router.push('/(usher)/calendar')}>
          <Box
            flexDirection="row"
            alignItems="center"
            backgroundColor="bgSurface"
            borderWidth={1}
            borderColor="borderDefault"
            borderRadius="lg"
            padding="400"
            style={[{ gap: 12 }, shadowSm]}
          >
            <Box style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandEmeraldTint }}>
              <Icon name="calendar" size={20} color="brandEmerald" />
            </Box>
            <Box flex={1} style={{ gap: 2 }}>
              <Text variant="titleM">Manage availability</Text>
              <Text variant="bodySm" color="inkMuted">Mark the days you can work to get matched.</Text>
            </Box>
            <Icon name="chevron-right" size={20} color="inkMuted" />
          </Box>
        </Pressable>

        <Box style={{ gap: 12 }}>
          <SectionHeader title="Upcoming jobs" actionLabel="See all" onAction={() => router.push('/(usher)/jobs')} />
          {upcoming.length === 0 ? (
            <Text variant="bodySm" color="inkMuted">No upcoming jobs yet — apply from the Jobs tab.</Text>
          ) : (
            upcoming.map((b) => (
              <JobRow
                key={b.id}
                booking={b}
                onPress={() => router.push({ pathname: '/(modals)/check-in', params: { booking: b.id } })}
              />
            ))
          )}
        </Box>
      </ScrollView>
    </Box>
  );
}
