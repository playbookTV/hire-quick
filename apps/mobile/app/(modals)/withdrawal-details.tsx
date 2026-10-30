import { useLocalSearchParams } from 'expo-router';
import { Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Button } from '../../components/Button.js';
import { Card } from '../../components/Card.js';
import { QueryState } from '../../components/QueryState.js';
import { StatusPill } from '../../components/StatusPill.js';
import { KeyValueRow } from '../../components/KeyValueRow.js';
import { useWallet, useWithdrawalRecord } from '../../lib/hooks.js';
import { money } from '../../lib/format.js';
import { isPayoutTransfer, isWeeklyPayouts } from '../../lib/payouts.js';
import { openSupport } from '../../lib/support.js';
const COPY = {
  REQUESTED: 'Your request is recorded and awaiting processing.',
  PROCESSING: 'Your bank transfer is processing. This screen checks for updates automatically.',
  PAID: 'The bank transfer has been confirmed as paid.',
  FAILED:
    'This transfer failed or was reversed. Check your wallet balance before requesting another withdrawal.',
};
/** Weekly runs retry a failed payout themselves (the amount is back in the wallet). */
const WEEKLY_FAILED =
  'This payout failed or was reversed. The amount is back in your wallet and goes out with the next weekly payout. Check your payout account details.';
/** Also the target of PAYOUT_SENT / PAYOUT_FAILED notifications: a weekly payout is a withdrawal. */
export default function WithdrawalDetails(): React.JSX.Element {
  const { id = '' } = useLocalSearchParams<{ id?: string }>();
  const query = useWithdrawalRecord(id);
  const wallet = useWallet().data;
  // Any failed transfer's money goes out with the next run while runs are on.
  const weekly = isWeeklyPayouts(wallet);
  const noun = isPayoutTransfer(query.data, wallet) ? 'payout' : 'withdrawal';
  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title={noun === 'payout' ? 'Payout details' : 'Withdrawal details'} showBack inset />
      <Screen scroll>
        <QueryState query={query}>
          {(w) => (
            <Box style={{ gap: 20 }}>
              <Text variant="h1">{money(w.amount)}</Text>
              <StatusPill status={w.status} />
              <Text variant="body">
                {weekly && w.status === 'FAILED' ? WEEKLY_FAILED : COPY[w.status]}
              </Text>
              <Card>
                <KeyValueRow label="Account name" value={w.bank.accountName} />
                <KeyValueRow label="Account" value={`•••• ${w.bank.last4}`} />
                <KeyValueRow label="Requested" value={new Date(w.createdAt).toLocaleString()} />
                <KeyValueRow label="Last updated" value={new Date(w.updatedAt).toLocaleString()} />
              </Card>
              <Text variant="bodySm" color="inkMuted" selectable>
                Reference: {w.reference ?? w.id}
              </Text>
              <Button
                label={query.isFetching ? 'Checking…' : 'Check latest status'}
                variant="secondary"
                disabled={query.isFetching}
                onPress={() => {
                  void query.refetch();
                }}
              />
              <Button
                label={`Get help with this ${noun}`}
                variant="ghost"
                onPress={() => {
                  void openSupport(
                    `Hi HireQuick support, I need help with ${noun} ${w.id}. Status: ${w.status}.`,
                  );
                }}
              />
            </Box>
          )}
        </QueryState>
      </Screen>
    </Box>
  );
}
