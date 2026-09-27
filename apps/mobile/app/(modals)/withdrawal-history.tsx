import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Button } from '../../components/Button.js';
import { Card } from '../../components/Card.js';
import { QueryState } from '../../components/QueryState.js';
import { StatusPill } from '../../components/StatusPill.js';
import { useWithdrawalHistory } from '../../lib/hooks.js';
import { money, shortDate } from '../../lib/format.js';
export default function WithdrawalHistory(): React.JSX.Element {
  const [cursors, setCursors] = useState<string[]>([]);
  const query = useWithdrawalHistory(cursors.at(-1));
  const { refetch } = query;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const router = useRouter();
  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Withdrawal history" showBack inset />
      <Screen scroll>
        <QueryState query={query}>
          {(page) => (
            <Box style={{ gap: 16 }}>
              {page.items.length === 0 ? (
                <Text variant="body" color="inkMuted">
                  No withdrawals yet. Bank transfers will appear here when you request them.
                </Text>
              ) : null}
              {page.items.map((w) => (
                <Card key={w.id}>
                  <Box style={{ gap: 10 }}>
                    <Text variant="titleM">{money(w.amount)}</Text>
                    <StatusPill status={w.status} />
                    <Text variant="bodySm">
                      {shortDate(w.createdAt)} · Account ending {w.bank.last4}
                    </Text>
                    <Button
                      label="View withdrawal"
                      variant="secondary"
                      onPress={() =>
                        router.push({
                          pathname: '/(modals)/withdrawal-details',
                          params: { id: w.id },
                        })
                      }
                    />
                  </Box>
                </Card>
              ))}
              {cursors.length ? (
                <Button
                  label="Newer withdrawals"
                  variant="secondary"
                  onPress={() => setCursors((c) => c.slice(0, -1))}
                />
              ) : null}
              {page.nextCursor ? (
                <Button
                  label="Older withdrawals"
                  variant="secondary"
                  onPress={() => setCursors((c) => [...c, page.nextCursor!])}
                />
              ) : null}
            </Box>
          )}
        </QueryState>
      </Screen>
    </Box>
  );
}
