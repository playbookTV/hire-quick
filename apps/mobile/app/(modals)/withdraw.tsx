/**
 * Withdraw to bank — drives `POST /api/payments/withdrawals` (idempotent). Lists
 * the usher's registered bank accounts (`useBankAccounts`); if none, lets them
 * add one (`AddBankAccountForm`).
 *
 * While weekly payout runs are on (`payoutMode: 'weekly'`) the API refuses new
 * withdrawals with `409 PAYOUTS_SCHEDULED`, so this screen explains the weekly
 * payout instead. A withdrawal saved before the switch still opens its receipt.
 *
 * Three steps — this is the usher's money leaving escrow, so it is NOT
 * fire-and-forget (critique P0):
 *   form → review (confirm amount + destination, no surprise fee) → done
 *          (a receipt that reflects the persisted withdrawal outcome).
 * The full amount is transferred with no fee (api payments/service initWithdrawal),
 * so the review states that plainly rather than inventing a fee/ETA.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Field } from '../../components/Field.js';
import { Input } from '../../components/Input.js';
import { Button } from '../../components/Button.js';
import { Icon } from '../../components/Icon.js';
import { IconCircle } from '../../components/IconCircle.js';
import { OptionCard } from '../../components/OptionCard.js';
import { EmptyState } from '../../components/EmptyState.js';
import { Loading } from '../../components/Loading.js';
import { AddBankAccountForm } from '../../components/AddBankAccountForm.js';
import { shadowMd } from '../../theme/shadows.js';
import { fonts } from '../../theme/fonts.js';
import { useWallet, useBanks, useBankAccounts, useWithdraw } from '../../lib/hooks.js';
import { hapticSuccess } from '../../lib/haptics.js';
import { parseNairaInput, nairaInput } from '../../lib/amount-input.js';
import { money } from '../../lib/format.js';
import { formatPayoutDate, isWeeklyPayouts, nextPayoutDate } from '../../lib/payouts.js';
import type { BankAccount } from '../../lib/types.js';
import type { WithdrawalResponse } from '@hq/shared';
import {
  withdrawalReceipt,
  WithdrawalAttemptError,
  PAYOUTS_SCHEDULED,
} from '../../lib/withdrawal.js';

type Step = 'form' | 'review' | 'done';

/** A frozen snapshot of what was sent, so `done` stays accurate after refetch. */
interface Sent extends WithdrawalResponse {
  account: BankAccount;
}

export default function Withdraw(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const wallet = useWallet();
  const accounts = useBankAccounts();
  const banks = useBanks();
  const [addingAccount, setAddingAccount] = useState(false);
  const bankName = (code: string) =>
    banks.data?.find((b) => b.code === code)?.name ?? `Bank ${code}`;
  const withdraw = useWithdraw();

  const available = wallet.data?.availableBalance ?? 0;
  const [step, setStep] = useState<Step>('form');
  const [selected, setSelected] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  // Seed the amount with the full balance once the wallet resolves — not at mount, when
  // `available` is still 0 and would prefill "0" the user must clear (U6).
  const amountSeeded = useRef(false);
  useEffect(() => {
    if (!amountSeeded.current && wallet.data) {
      amountSeeded.current = true;
      setAmount(nairaInput(available));
    }
  }, [wallet.data, available]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [pendingIntent, setPendingIntent] = useState<{
    amountKobo: number;
    account: BankAccount;
  } | null>(null);
  // The API answered 409 PAYOUTS_SCHEDULED: weekly runs replaced withdrawals.
  const [payoutsScheduled, setPayoutsScheduled] = useState(false);

  const list = accounts.data ?? [];
  const activeId = selected ?? list[0]?.id ?? null;
  const activeAccount = list.find((a) => a.id === activeId) ?? null;

  useEffect(() => {
    if (!withdraw.savedAttempt || withdraw.isRestoring || step === 'done') return;
    amountSeeded.current = true;
    const { input, outcome } = withdraw.savedAttempt;
    const account = (accounts.data ?? []).find((a) => a.id === input.bankAccountId) ?? {
      id: input.bankAccountId,
      accountName: 'Saved bank account',
      bankCode: '',
      accountNumber: '',
      verified: false,
    };
    if (outcome) {
      setSent({ ...outcome, account });
      setPendingIntent(null);
      setStep('done');
      return;
    }
    setPendingIntent({ amountKobo: input.amountKobo, account });
    setSelected(input.bankAccountId);
    setAmount(nairaInput(input.amountKobo));
    setStep('review');
  }, [withdraw.savedAttempt, withdraw.isRestoring, accounts.data, step]);

  const parsedAmount = parseNairaInput(amount);
  const amountKobo = parsedAmount ?? 0;
  const amountValid =
    parsedAmount !== null &&
    Number.isFinite(amountKobo) &&
    amountKobo > 0 &&
    amountKobo <= available;
  const amountError =
    parsedAmount === null && amount.trim()
      ? 'Enter naira and up to two decimal places, for example 42.51.'
      : getAmountError(amount, amountKobo, amountValid, available);

  const onConfirm = (): void => {
    if (withdraw.isPending || (!pendingIntent && (!activeAccount || !amountValid))) return;
    const intent = pendingIntent ?? { amountKobo, account: activeAccount! };
    setPendingIntent(intent);
    setSubmitError(null);
    withdraw.mutate(
      { bankAccountId: intent.account.id, amountKobo: intent.amountKobo },
      {
        onSuccess: (outcome) => {
          if (outcome.status === 'PAID') hapticSuccess();
          setSent({ ...outcome, account: intent.account });
          setPendingIntent(null);
          setStep('done');
        },
        onError: (e: unknown) => {
          if (e instanceof WithdrawalAttemptError && e.code === PAYOUTS_SCHEDULED) {
            // Refresh the wallet so it shows the next weekly payout instead of Withdraw.
            void wallet.refetch();
            setPayoutsScheduled(true);
            if (!e.retryRequired) {
              setPendingIntent(null);
              setStep('form');
            } else {
              setSubmitError(
                'Withdrawals are now paid weekly, so this saved request can’t be checked here. If it went through, it is in your withdrawal history. If not, the money is still in your wallet and goes out with the next weekly payout.',
              );
            }
          } else if (e instanceof WithdrawalAttemptError && !e.retryRequired) {
            setPendingIntent(null);
            setSubmitError(e instanceof Error ? e.message : 'Check the withdrawal details.');
          } else {
            setSubmitError(
              'We couldn’t confirm the outcome. Tap Check withdrawal to safely retry the same request.',
            );
          }
        },
      },
    );
  };

  // ---------------------------------------------------------------- done
  if (step === 'done' && sent) {
    const receipt = withdrawalReceipt[sent.status];
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar title="" inset />
        <Screen scroll>
          <Box
            alignItems="center"
            style={{ gap: 16, maxWidth: 360, alignSelf: 'center', paddingTop: 24 }}
          >
            <IconCircle icon={receipt.icon} tone={receipt.tone} size={96} />
            <Text variant="h2" style={{ textAlign: 'center' }}>
              {receipt.title}
            </Text>
            <Text variant="bodyLg" color="inkMuted" style={{ textAlign: 'center' }}>
              {receipt.description}
            </Text>

            {/* receipt */}
            <Box
              alignSelf="stretch"
              backgroundColor="bgSurface"
              borderWidth={1}
              borderColor="borderDefault"
              borderRadius="lg"
              padding="400"
              style={{ gap: 12 }}
            >
              <ReceiptRow label={receipt.amountLabel} value={money(sent.amountKobo)} strong />
              <ReceiptRow label="To" value={accountLabel(sent.account)} />
              <Box height={1} backgroundColor="borderDefault" />
              <Button
                label="Track this withdrawal"
                variant="secondary"
                onPress={() =>
                  router.push({
                    pathname: '/(modals)/withdrawal-details',
                    params: { id: sent.withdrawalId },
                  })
                }
              />
              <ReceiptRow label="Balance after withdrawal" value={money(sent.availableBalance)} />
            </Box>

            <Box alignSelf="stretch" style={{ paddingTop: 4 }}>
              {receiptError ? (
                <Text variant="bodySm" color="statusDanger">
                  {receiptError}
                </Text>
              ) : null}
              <Button
                label="Done"
                loading={withdraw.isAcknowledging}
                disabled={withdraw.isAcknowledging}
                onPress={() => {
                  setReceiptError(null);
                  void withdraw
                    .acknowledge(sent.withdrawalId)
                    .then(() => router.back())
                    .catch(() => {
                      setReceiptError('We couldn’t close this saved receipt. Try Done again.');
                    });
                }}
              />
            </Box>
          </Box>
        </Screen>
        <Box style={{ paddingBottom: insets.bottom }} />
      </Box>
    );
  }

  if (
    !pendingIntent &&
    step !== 'done' &&
    !withdraw.savedAttempt &&
    !withdraw.isRestoring &&
    (payoutsScheduled || isWeeklyPayouts(wallet.data))
  )
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar title="Weekly payouts" showBack inset />
        <Screen scroll>
          <Box style={{ paddingTop: 24 }}>
            <EmptyState
              icon="calendar"
              title="Payouts are automatic"
              subtitle="You don’t need to withdraw. Every Thursday from 9:00 AM Lagos time, your available balance is sent to your payout account."
              reason={
                wallet.data
                  ? `Next payout: ${formatPayoutDate(nextPayoutDate(wallet.data, new Date()), new Date())}`
                  : undefined
              }
              actionLabel="Choose payout account"
              onAction={() => router.replace('/(modals)/payout-account')}
              secondaryLabel="Back to wallet"
              onSecondary={() => router.back()}
            />
          </Box>
        </Screen>
      </Box>
    );

  if (!pendingIntent && step !== 'done' && (wallet.isError || accounts.isError))
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar title="Withdraw" showBack inset />
        <EmptyState
          icon="alert-circle"
          title="Couldn’t load withdrawal details"
          subtitle="Your balance and saved accounts must be available before a new withdrawal."
          actionLabel="Try again"
          onAction={() => {
            void wallet.refetch();
            void accounts.refetch();
          }}
        />
      </Box>
    );

  // ---------------------------------------------------------------- review
  const reviewAccount = pendingIntent?.account ?? activeAccount;
  if (step === 'review' && reviewAccount) {
    const remaining = Math.max(0, available - amountKobo);
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar
          title="Confirm withdrawal"
          showBack={!pendingIntent}
          inset
          onBack={() => setStep('form')}
        />
        <Screen scroll>
          <Box style={{ gap: 20 }}>
            {/* the amount, owned by the emerald hero so it reads as "real money" */}
            <Box
              borderRadius="lg"
              style={[
                { backgroundColor: theme.colors.brandSurface, padding: 20, gap: 6 },
                shadowMd,
              ]}
            >
              <Text variant="overline" color="onBrandAccent">
                YOU’RE WITHDRAWING
              </Text>
              <Text
                style={{
                  fontFamily: fonts.displayBlack,
                  fontSize: 40,
                  lineHeight: 44,
                  letterSpacing: -1.5,
                }}
                color="inverseInk"
              >
                {money(amountKobo)}
              </Text>
            </Box>

            <Box
              backgroundColor="bgSurface"
              borderWidth={1}
              borderColor="borderDefault"
              borderRadius="lg"
              padding="400"
              style={{ gap: 12 }}
            >
              <ReceiptRow label="To" value={reviewAccount.accountName} strong />
              {reviewAccount.accountNumber ? (
                <ReceiptRow
                  label="Account"
                  value={`${bankName(reviewAccount.bankCode)} ••${reviewAccount.accountNumber.slice(-4)}`}
                />
              ) : null}
              <Box height={1} backgroundColor="borderDefault" />
              <Box flexDirection="row" alignItems="center" style={{ gap: 8 }}>
                <Icon name="check-circle" size={16} color="statusSuccess" />
                <Text variant="bodySm" color="inkDefault" style={{ flex: 1 }}>
                  No fee — you receive the full amount.
                </Text>
              </Box>
              {!pendingIntent ? (
                <ReceiptRow label="Balance after" value={money(remaining)} />
              ) : null}
            </Box>

            {submitError ? (
              <Box
                flexDirection="row"
                alignItems="center"
                backgroundColor="statusDangerTint"
                borderRadius="md"
                padding="300"
                style={{ gap: 8 }}
              >
                <Icon name="alert-circle" size={16} color="statusDanger" />
                <Text variant="bodySm" color="statusDanger" style={{ flex: 1 }}>
                  {submitError}
                </Text>
              </Box>
            ) : null}

            {payoutsScheduled && pendingIntent ? (
              <Box style={{ gap: 8 }}>
                <Button
                  label="Withdrawal history"
                  onPress={() => router.replace('/(modals)/withdrawal-history')}
                />
                <Button label="Back to wallet" variant="ghost" onPress={() => router.back()} />
              </Box>
            ) : (
              <Box style={{ gap: 8 }}>
                <Button
                  label={
                    withdraw.isPending
                      ? 'Checking…'
                      : pendingIntent
                        ? 'Check withdrawal'
                        : `Withdraw ${money(amountKobo)}`
                  }
                  onPress={onConfirm}
                  loading={withdraw.isPending}
                  disabled={withdraw.isPending}
                />
                <Button
                  label="Edit"
                  variant="ghost"
                  onPress={() => setStep('form')}
                  disabled={withdraw.isPending || !!pendingIntent}
                />
              </Box>
            )}
          </Box>
        </Screen>
        <Box style={{ paddingBottom: insets.bottom }} />
      </Box>
    );
  }

  // ---------------------------------------------------------------- form
  if (withdraw.restoreError) {
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar title="Withdraw" showBack inset />
        <Screen>
          <Text variant="body">
            We couldn’t check for a saved withdrawal. Try again before starting a new one.
          </Text>
          <Button
            label="Try again"
            onPress={() => {
              void withdraw.retryRestore();
            }}
          />
        </Screen>
      </Box>
    );
  }
  if (wallet.isLoading || withdraw.isRestoring || withdraw.savedAttempt) {
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar title="Withdraw" showBack inset />
        <Loading />
      </Box>
    );
  }
  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Withdraw" showBack inset />
      <Screen scroll>
        <Box style={{ gap: 20 }}>
          <Box style={{ gap: 4 }}>
            <Text variant="overline" color="inkMuted">
              AVAILABLE
            </Text>
            <Text variant="h1" color="brandEmerald">
              {money(available)}
            </Text>
          </Box>

          {accounts.isLoading ? (
            <Loading />
          ) : list.length > 0 && !addingAccount ? (
            <Box style={{ gap: 12 }}>
              <Text variant="headingS">To account</Text>
              {list.map((a) => (
                <OptionCard
                  key={a.id}
                  title={a.accountName}
                  subtitle={`${bankName(a.bankCode)} · ••${a.accountNumber.slice(-4)}`}
                  selected={activeId === a.id}
                  onPress={() => setSelected(a.id)}
                />
              ))}
              <Button
                label="Add another account"
                variant="ghost"
                onPress={() => setAddingAccount(true)}
              />
              <Field label="Amount (₦)" error={amountError ?? undefined}>
                <Input
                  value={amount}
                  onChangeText={setAmount}
                  error={!!amountError}
                  keyboardType="decimal-pad"
                  placeholder="0"
                />
              </Field>
              {available > 0 ? (
                <Pressable
                  onPress={() => setAmount(nairaInput(available))}
                  accessibilityRole="button"
                  accessibilityLabel={`Withdraw all, ${money(available)}`}
                  hitSlop={8}
                  style={{ alignSelf: 'flex-start' }}
                >
                  <Text variant="label" color="brandEmerald">
                    Withdraw all ({money(available)})
                  </Text>
                </Pressable>
              ) : null}
              <Button
                label="Review withdrawal"
                onPress={() => {
                  if (!amountValid) return;
                  setSubmitError(null);
                  setStep('review');
                }}
                disabled={!amountValid || !activeId}
              />
            </Box>
          ) : (
            <AddBankAccountForm
              onAdded={(account) => {
                setSelected(account.id);
                setAddingAccount(false);
              }}
              onCancel={list.length > 0 ? () => setAddingAccount(false) : undefined}
            />
          )}
        </Box>
      </Screen>
      <Box style={{ paddingBottom: insets.bottom }} />
    </Box>
  );
}

function accountLabel(account: BankAccount): string {
  return account.accountNumber
    ? `${account.accountName} · ${account.bankCode} ••${account.accountNumber.slice(-4)}`
    : account.accountName;
}

/** Inline validation for the amount field (no nested ternary, no blocking Alert). */
function getAmountError(
  amount: string,
  amountKobo: number,
  valid: boolean,
  available: number,
): string | null {
  if (amount.length === 0 || valid) return null;
  if (amountKobo > available) return 'That’s more than your available balance.';
  return 'Enter an amount above ₦0.';
}

/** Label/value row used by the review + done receipts. */
function ReceiptRow({
  label,
  value,
  strong,
}: Readonly<{ label: string; value: string; strong?: boolean }>): React.JSX.Element {
  return (
    <Box
      flexDirection="row"
      alignItems="baseline"
      justifyContent="space-between"
      style={{ gap: 12 }}
    >
      <Text variant="bodySm" color="inkMuted">
        {label}
      </Text>
      <Text
        variant={strong ? 'amountM' : 'bodySm'}
        color={strong ? 'inkStrong' : 'inkDefault'}
        style={{ flex: 1, textAlign: 'right' }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </Box>
  );
}
