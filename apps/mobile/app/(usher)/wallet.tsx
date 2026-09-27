import { useRouter } from 'expo-router';
import { ScrollView, RefreshControl, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Text } from '../../theme/restyle.js';
import { screenTokens } from '../../theme/token-manager.js';
import { ScreenHeading } from '../../components/ScreenHeading.js';
import { SectionHeader } from '../../components/SectionHeader.js';
import { QueryState } from '../../components/QueryState.js';
import { ActivityRow } from '../../components/ActivityRow.js';
import { Button } from '../../components/Button.js';
import { Icon } from '../../components/Icon.js';
import { Card } from '../../components/Card.js';
import { EmptyState } from '../../components/EmptyState.js';
import { EarningsCard } from '../../components/EarningsCard.js';
import { useAuth } from '../../lib/auth-context.js';
import { useWallet, useWalletActivity, useBookings } from '../../lib/hooks.js';
import { heldFundsCopy } from '../../lib/payment-copy.js';
import { money, signedMoney } from '../../lib/format.js';

export default function Wallet(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const wallet = useWallet();
  const activity = useWalletActivity();
  const bookings = useBookings();
  const pendingCount = bookings.data?.filter((b) => b.status === 'PENDING_PAYMENT').length;
  const openBookings = () => router.push('/(modals)/my-bookings');
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
            refreshing={wallet.isFetching || activity.isFetching}
            onRefresh={() => {
              void wallet.refetch();
              void activity.refetch();
              void bookings.refetch();
            }}
          />
        }
      >
        <ScreenHeading title="Wallet" subtitle={user?.usher?.displayName ?? undefined} />
        <QueryState query={wallet} errorTitle="Couldn’t load your balance">
          {(balance) => (
            <>
              <EarningsCard
                amount={balance.availableBalance}
                footer={
                  <Text variant="bodySm" color="inkOnElevatedMuted">
                    Money released to your wallet.
                  </Text>
                }
              />
              <Button
                label="Withdraw to bank"
                disabled={balance.availableBalance <= 0}
                onPress={() => router.push('/(modals)/withdraw')}
              />
              <Text variant="headingS" color="inkMuted">
                Not available
              </Text>
              <Card>
                <Pressable
                  onPress={openBookings}
                  accessibilityRole="button"
                  accessibilityLabel="View held funds in your bookings"
                >
                  <Box gap="100" paddingVertical="100">
                    <Box
                      flexDirection="row"
                      flexWrap="wrap"
                      alignItems="center"
                      justifyContent="space-between"
                      gap="200"
                    >
                      <Text variant="labelLg">Held</Text>
                      <Box flexDirection="row" alignItems="center" gap="300">
                        <Text variant="amountM" color="moneyHeld">
                          {money(balance.pendingEscrow)}
                        </Text>
                        <Icon name="chevron-right" size={16} color="inkMuted" />
                      </Box>
                    </Box>
                    <Text variant="bodySm" color="inkMuted">
                      {heldFundsCopy}
                    </Text>
                  </Box>
                </Pressable>
                <Box marginVertical="300" height={1} backgroundColor="borderDefault" />
                <Pressable
                  onPress={openBookings}
                  accessibilityRole="button"
                  accessibilityLabel="View bookings awaiting client payment"
                >
                  <Box gap="100" paddingVertical="100">
                    <Box
                      flexDirection="row"
                      alignItems="center"
                      justifyContent="space-between"
                      gap="200"
                    >
                      <Text variant="labelLg">Pending</Text>
                      <Box flexDirection="row" alignItems="center" gap="300">
                        <Text variant="bodySm" color="inkMuted">
                          {pendingCount === undefined
                            ? 'Unavailable'
                            : `${pendingCount} booking${pendingCount === 1 ? '' : 's'}`}
                        </Text>
                        <Icon name="chevron-right" size={16} color="inkMuted" />
                      </Box>
                    </Box>
                    <Text variant="bodySm" color="inkMuted">
                      Awaiting client payment
                    </Text>
                  </Box>
                </Pressable>
              </Card>
            </>
          )}
        </QueryState>
        <Box>
          <SectionHeader
            title="Recent activity"
            appearance="heading"
            actionLabel="Withdrawals"
            onAction={() => router.push('/(modals)/withdrawal-history')}
          />
          <QueryState query={activity} errorTitle="Couldn’t load your recent activity">
            {(items) =>
              items.length === 0 ? (
                <EmptyState
                  icon="inbox"
                  title="No activity yet"
                  subtitle="Your payouts and withdrawals will appear here."
                />
              ) : (
                items.map((item) => (
                  <ActivityRow
                    key={item.id}
                    type={item.type}
                    title={item.title}
                    subtitle={item.subtitle}
                    amount={signedMoney(item.amount, item.type)}
                  />
                ))
              )
            }
          </QueryState>
        </Box>
        {wallet.data ? (
          <Box flexDirection="row" flexWrap="wrap" justifyContent="space-between" gap="200">
            <Text variant="bodySm" color="inkMuted">
              Lifetime earned
            </Text>
            <Text variant="amountM">{money(wallet.data.lifetimeEarned)}</Text>
          </Box>
        ) : null}
      </ScrollView>
    </Box>
  );
}
