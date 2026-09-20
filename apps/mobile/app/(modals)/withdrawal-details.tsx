import { useLocalSearchParams } from 'expo-router';
import { Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Button } from '../../components/Button.js';
import { Card } from '../../components/Card.js';
import { QueryState } from '../../components/QueryState.js';
import { StatusPill } from '../../components/StatusPill.js';
import { KeyValueRow } from '../../components/KeyValueRow.js';
import { useWithdrawalRecord } from '../../lib/hooks.js';
import { money } from '../../lib/format.js';
import { openSupport } from '../../lib/support.js';
const COPY = {
  REQUESTED: 'Your request is recorded and awaiting processing.',
  PROCESSING: 'Your bank transfer is processing. This screen checks for updates automatically.',
  PAID: 'The bank transfer has been confirmed as paid.',
  FAILED:
    'This transfer failed or was reversed. Check your wallet balance before requesting another withdrawal.',
};
export default function WithdrawalDetails(): React.JSX.Element {
  const { id = '' } = useLocalSearchParams<{ id?: string }>();
  const query = useWithdrawalRecord(id);
  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Withdrawal details" showBack inset />
      <Screen scroll>
        <QueryState query={query}>
          {(w) => (
            <Box style={{ gap: 20 }}>
              <Text variant="h1">{money(w.amount)}</Text>
              <StatusPill status={w.status} />
              <Text variant="body">{COPY[w.status]}</Text>
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
                label="Get help with this withdrawal"
                variant="ghost"
                onPress={() => {
                  void openSupport(
                    `Hi HireQuick support, I need help with withdrawal ${w.id}. Status: ${w.status}.`,
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
