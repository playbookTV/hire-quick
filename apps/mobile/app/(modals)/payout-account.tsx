/**
 * Payout account — the bank account weekly payout runs pay into
 * (`PUT /api/payments/payout-account`). Lists the usher's accounts, marks the
 * current one, and adds a new one with the shared bank-app flow
 * (`AddBankAccountForm`). An usher's first account becomes the payout account
 * on the server automatically; a later one is chosen here and confirmed.
 *
 * The API refuses an unverified account with `409 UNVERIFIED_ACCOUNT`; its
 * message is shown as is. A changed account is flagged for the admin who
 * approves the next run, so the screen says it will be checked.
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Button } from '../../components/Button.js';
import { Banner } from '../../components/Banner.js';
import { Icon } from '../../components/Icon.js';
import { OptionCard } from '../../components/OptionCard.js';
import { QueryState } from '../../components/QueryState.js';
import { AddBankAccountForm } from '../../components/AddBankAccountForm.js';
import { useBankAccounts, useBanks, useSetPayoutAccount, useWallet } from '../../lib/hooks.js';
import { userMessage } from '../../lib/api-error.js';
import { hapticSuccess } from '../../lib/haptics.js';
import { maskedAccountLabel } from '../../lib/payouts.js';
import type { BankAccount } from '../../lib/types.js';

export default function PayoutAccount(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const accounts = useBankAccounts();
  const banks = useBanks();
  const wallet = useWallet();
  const setPayoutAccount = useSetPayoutAccount();
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const label = (a: Pick<BankAccount, 'bankCode' | 'accountNumber'>): string =>
    maskedAccountLabel(a.bankCode, a.accountNumber.slice(-4), banks.data);

  const save = (account: BankAccount): void => {
    setError(null);
    setConfirmation(null);
    setPayoutAccount.mutate(account.id, {
      onSuccess: () => {
        hapticSuccess();
        setSelected(null);
        setConfirmation(`Weekly payouts will go to ${account.accountName}, ${label(account)}.`);
      },
      onError: (e) => setError(userMessage(e)),
    });
  };

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Payout account" showBack inset />
      <Screen
        scroll
        refreshing={accounts.isRefetching}
        onRefresh={() => {
          void accounts.refetch();
          void wallet.refetch();
        }}
      >
        <Box style={{ gap: 20, paddingBottom: insets.bottom + 24 }}>
          <Text variant="body" color="inkMuted">
            Your weekly payout is sent to this account every Thursday from 9:00 AM Lagos time.
          </Text>
          <QueryState query={accounts} errorTitle="Couldn’t load your bank accounts">
            {(list) => {
              // The wallet's payout account covers an API that predates `isPayoutAccount`.
              const currentId =
                list.find((a) => a.isPayoutAccount)?.id ?? wallet.data?.payoutAccount?.id ?? null;
              const chosenId = selected ?? currentId;
              const chosen = list.find((a) => a.id === chosenId) ?? null;
              const changing = chosen !== null && chosen.id !== currentId;

              if (adding || list.length === 0)
                return (
                  <AddBankAccountForm
                    onAdded={(account) => {
                      setAdding(false);
                      setError(null);
                      if (currentId) {
                        // A later account must be chosen explicitly.
                        setConfirmation(null);
                        setSelected(account.id);
                      } else {
                        // The server made the first account the payout account.
                        setConfirmation(
                          `Weekly payouts will go to ${account.accountName}, ${label(account)}.`,
                        );
                      }
                    }}
                    onCancel={list.length > 0 ? () => setAdding(false) : undefined}
                  />
                );

              return (
                <Box style={{ gap: 12 }}>
                  <Text variant="headingS">Your bank accounts</Text>
                  {list.map((a) => (
                    <OptionCard
                      key={a.id}
                      title={a.accountName}
                      subtitle={[
                        label(a),
                        a.id === currentId ? 'Current payout account' : null,
                        a.verified ? null : 'Not verified',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      selected={a.id === chosenId}
                      onPress={() => {
                        setSelected(a.id);
                        setError(null);
                        setConfirmation(null);
                      }}
                    />
                  ))}
                  <Button
                    label="Add another account"
                    variant="ghost"
                    disabled={setPayoutAccount.isPending}
                    onPress={() => {
                      setAdding(true);
                      setError(null);
                      setConfirmation(null);
                    }}
                  />

                  {confirmation ? <Banner tone="success" message={confirmation} /> : null}
                  {error ? (
                    <Box
                      flexDirection="row"
                      alignItems="center"
                      backgroundColor="statusDangerTint"
                      borderRadius="md"
                      padding="300"
                      style={{ gap: 8 }}
                    >
                      <Icon name="alert-circle" size={16} color="statusDanger" />
                      <Text
                        variant="bodySm"
                        color="statusDanger"
                        style={{ flex: 1 }}
                        accessibilityRole="alert"
                      >
                        {error}
                      </Text>
                    </Box>
                  ) : null}

                  {changing && chosen ? (
                    <Box style={{ gap: 12 }}>
                      {chosen.verified ? (
                        <Text variant="bodySm" color="inkMuted">
                          For your security, our team checks a newly chosen payout account before
                          the next payout is sent to it.
                        </Text>
                      ) : (
                        <Text variant="bodySm" color="statusDanger">
                          This account isn’t verified for payouts. Add it again to verify it.
                        </Text>
                      )}
                      <Button
                        label={setPayoutAccount.isPending ? 'Saving…' : 'Use this account'}
                        loading={setPayoutAccount.isPending}
                        disabled={setPayoutAccount.isPending || !chosen.verified}
                        onPress={() => save(chosen)}
                      />
                    </Box>
                  ) : (
                    <Button label="Done" variant="secondary" onPress={() => router.back()} />
                  )}
                </Box>
              );
            }}
          </QueryState>
        </Box>
      </Screen>
    </Box>
  );
}
