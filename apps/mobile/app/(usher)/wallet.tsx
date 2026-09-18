import { QueryState } from '../../components/QueryState.js';
/**
 * Wallet — matches Figma `Usher / 05 Wallet` (44:44). Live: balance + pending +
 * lifetime from `useWallet`; the recent-activity feed from `useWalletActivity`.
 * Withdraw opens the bank-transfer sheet.
 */
import { useRouter } from 'expo-router';
import { ScrollView, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Text } from '../../theme/restyle.js';
import { SectionHeader } from '../../components/SectionHeader.js';
import { ActivityRow } from '../../components/ActivityRow.js';
import { Button } from '../../components/Button.js';
import { Icon } from '../../components/Icon.js';
import { SkeletonRow } from '../../components/Skeleton.js';
import { EmptyState } from '../../components/EmptyState.js';
import { Banner } from '../../components/Banner.js';
import { EarningsCard } from '../../components/EarningsCard.js';
import { useWallet, useWalletActivity, useBookings } from '../../lib/hooks.js';
import { money, signedMoney, formatEventDate } from '../../lib/format.js';

function StatCard({
  label,
  value,
  gold,
}: Readonly<{ label: string; value: string; gold?: boolean }>) {
  return (
    <Box
      flex={1}
      backgroundColor="bgSurface"
      borderWidth={1}
      borderColor="borderDefault"
      borderRadius="md"
      padding="400"
      style={{ gap: 4 }}
    >
      <Text variant="bodySm" color="inkMuted">
        {label}
      </Text>
      <Text variant="amountM" color={gold ? 'accentGoldStrong' : 'inkStrong'}>
        {value}
      </Text>
    </Box>
  );
}

/**
 * Escrow explainer — defines the term and, crucially, says WHEN held money
 * releases (critique P1: held funds with no release date are an anxiety source).
 * The next-release date is derived from the usher's soonest unfinished booking.
 */
function escrowCopy(pending: number, nextReleaseDate?: string): string {
  if (pending <= 0)
    return 'When you’re booked, your pay is held safely here until the event is verified.';
  if (nextReleaseDate)
    return `Released to your wallet after each event is verified. Next: after ${formatEventDate(nextReleaseDate)}.`;
  return 'Held safely until each event is verified, then released to your wallet.';
}

function EscrowPanel({
  pending,
  nextReleaseDate,
}: Readonly<{ pending: number; nextReleaseDate?: string }>) {
  return (
    <Box
      backgroundColor="bgSurface"
      borderWidth={1}
      borderColor="borderDefault"
      borderRadius="md"
      padding="400"
      style={{ gap: 8 }}
    >
      <Box flexDirection="row" alignItems="center" justifyContent="space-between">
        <Box flexDirection="row" alignItems="center" style={{ gap: 8 }}>
          <Icon name="shield" size={16} color="accentGoldStrong" />
          <Text variant="bodySm" color="inkMuted">
            Held safely
          </Text>
        </Box>
        <Text variant="amountM" color="accentGoldStrong">
          {money(pending)}
        </Text>
      </Box>
      <Text variant="bodySm" color="inkMuted">
        {escrowCopy(pending, nextReleaseDate)}
      </Text>
    </Box>
  );
}

export default function Wallet(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const wallet = useWallet();
  const activity = useWalletActivity();
  const bookings = useBookings();

  // Soonest unfinished booking ≈ when the next escrow hold releases.
  const nextRelease = (bookings.data ?? [])
    .filter((b) => b.status === 'CONFIRMED' || b.status === 'CHECKED_IN')
    .map((b) => b.event?.eventDate)
    .filter((d): d is string => !!d)
    .sort()[0];

  const refreshing = wallet.isFetching || activity.isFetching;
  const refresh = (): void => {
    void wallet.refetch();
    void activity.refetch();
  };

  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 24,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <Text variant="h2">Wallet</Text>

        <QueryState query={wallet} errorTitle="Couldn’t load your balance">
          {(balance) => (
            <>
              {/* balance */}
              <EarningsCard
                amount={balance.availableBalance}
                size="lg"
                footer={
                  <Button
                    label="Withdraw to bank"
                    variant="secondary"
                    onPress={() => router.push('/(modals)/withdraw')}
                  />
                }
              />

              {/* escrow (what's held + when it releases) + lifetime */}
              <EscrowPanel pending={balance.pendingEscrow} nextReleaseDate={nextRelease} />
              <StatCard label="Lifetime earned" value={money(balance.lifetimeEarned)} />
            </>
          )}
        </QueryState>
        <SectionHeader title="Recent activity" />
        {activity.isLoading ? (
          <Box style={{ gap: 8 }}>
            {[0, 1, 2].map((i) => (
              <SkeletonRow key={i} />
            ))}
          </Box>
        ) : activity.isError ? (
          <Box style={{ gap: 12 }}>
            <Banner tone="warning" message="Couldn’t load your recent activity." />
            <Button
              label="Retry"
              variant="secondary"
              size="md"
              onPress={() => {
                void activity.refetch();
              }}
            />
          </Box>
        ) : (activity.data ?? []).length === 0 ? (
          <EmptyState
            icon="inbox"
            title="No activity yet"
            subtitle="Your payouts and withdrawals will show up here."
          />
        ) : (
          <Box style={{ gap: 8 }}>
            {(activity.data ?? []).map((a) => (
              <ActivityRow
                key={a.id}
                type={a.type}
                title={a.title}
                subtitle={a.subtitle}
                amount={signedMoney(a.amount, a.type)}
              />
            ))}
          </Box>
        )}
      </ScrollView>
    </Box>
  );
}
