/**
 * Withdraw to bank — drives `POST /api/payments/withdrawals` (idempotent). Lists
 * the usher's registered bank accounts (`useBankAccounts`); if none, lets them
 * add one with a real bank-app flow: pick a bank, type the 10-digit account
 * number, and the account name is resolved (`useResolveAccount`) before saving.
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
import { Pressable, Keyboard } from 'react-native';
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
import { Loading } from '../../components/Loading.js';
import { BankSelectModal } from '../../components/BankSelectModal.js';
import { shadowMd } from '../../theme/shadows.js';
import { fonts } from '../../theme/fonts.js';
import { useWallet, useBankAccounts, useAddBankAccount, useWithdraw, useResolveAccount } from '../../lib/hooks.js';
import { hapticSuccess } from '../../lib/haptics.js';
import { money } from '../../lib/format.js';
import type { Bank, BankAccount } from '../../lib/types.js';
import type { WithdrawalResponse } from '@hq/shared';
import { withdrawalReceipt, WithdrawalAttemptError } from '../../lib/withdrawal.js';

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
  const addAccount = useAddBankAccount();
  const withdraw = useWithdraw();
  const resolve = useResolveAccount();

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
      setAmount(String(Math.floor(available / 100)));
    }
  }, [wallet.data, available]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [pendingIntent, setPendingIntent] = useState<{ amountKobo: number; account: BankAccount } | null>(null);

  // add-account form
  const [bank, setBank] = useState<Bank | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [bankModal, setBankModal] = useState(false);
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const lastResolved = useRef<string>('');

  const list = accounts.data ?? [];
  const activeId = selected ?? list[0]?.id ?? null;
  const activeAccount = list.find((a) => a.id === activeId) ?? null;

  useEffect(() => {
    if (!withdraw.savedAttempt || withdraw.isRestoring || step === 'done') return;
    amountSeeded.current = true;
    const { input, outcome } = withdraw.savedAttempt;
    const account = list.find((a) => a.id === input.bankAccountId) ?? {
      id: input.bankAccountId, accountName: 'Saved bank account', bankCode: '', accountNumber: '', verified: false,
    };
    if (outcome) {
      setSent({ ...outcome, account });
      setPendingIntent(null);
      setStep('done');
      return;
    }
    setPendingIntent({ amountKobo: input.amountKobo, account });
    setSelected(input.bankAccountId);
    setAmount(String(input.amountKobo / 100));
    setStep('review');
  }, [withdraw.savedAttempt, withdraw.isRestoring, accounts.data, step]);

  const amountKobo = Math.round(Number(amount) * 100);
  const amountValid = Number.isFinite(amountKobo) && amountKobo > 0 && amountKobo <= available;
  const amountError = getAmountError(amount, amountKobo, amountValid, available);

  // Auto-resolve the account name once a bank + 10 digits are present (bank-app UX).
  useEffect(() => {
    setResolvedName(null);
    setResolveError(null);
    if (!bank || accountNumber.length !== 10) return;
    const key = `${bank.code}:${accountNumber}`;
    if (lastResolved.current === key) return;
    lastResolved.current = key;
    // Capture `key` so that if the user changes bank/number while this resolve is
    // in-flight, the stale onSuccess can't overwrite the display with the wrong name.
    const resolvedKey = key;
    resolve.mutate(
      { bankCode: bank.code, accountNumber },
      {
        onSuccess: (r) => {
          if (lastResolved.current !== resolvedKey) return; // stale response — discard
          setResolvedName(r.accountName);
        },
        onError: () => setResolveError("Couldn't verify this account. Check the number and bank."),
      },
    );
    // `resolve` is a stable mutation object, so it is intentionally not a dep.
  }, [bank, accountNumber]);

  const onAdd = (): void => {
    if (!bank || !resolvedName) return;
    addAccount.mutate(
      { bankCode: bank.code, accountNumber },
      {
        onSuccess: () => {
          setBank(null);
          setAccountNumber('');
          setResolvedName(null);
          lastResolved.current = '';
        },
        onError: () => setResolveError('Couldn’t add this account. Please try again.'),
      },
    );
  };

  // Why the "Add account" button is disabled, so the form isn't a silent dead end.
  const addHint = addAccountHint(bank, accountNumber);

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
          if (e instanceof WithdrawalAttemptError && !e.retryRequired) {
            setPendingIntent(null);
            setSubmitError(e instanceof Error ? e.message : 'Check the withdrawal details.');
          } else {
            setSubmitError('We couldn’t confirm the outcome. Tap Check withdrawal to safely retry the same request.');
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
          <Box alignItems="center" style={{ gap: 16, maxWidth: 360, alignSelf: 'center', paddingTop: 24 }}>
            <IconCircle icon={receipt.icon} tone={receipt.tone} size={96} />
            <Text variant="h2" style={{ textAlign: 'center' }}>
              {receipt.title}
            </Text>
            <Text variant="bodyLg" color="inkMuted" style={{ textAlign: 'center' }}>
              {receipt.description}
            </Text>

            {/* receipt */}
            <Box alignSelf="stretch" backgroundColor="bgSurface" borderWidth={1} borderColor="borderDefault" borderRadius="lg" padding="400" style={{ gap: 12 }}>
              <ReceiptRow label={receipt.amountLabel} value={money(sent.amountKobo)} strong />
              <ReceiptRow label="To" value={accountLabel(sent.account)} />
              <Box height={1} backgroundColor="borderDefault" />
              <ReceiptRow label="Balance after withdrawal" value={money(sent.availableBalance)} />
            </Box>

            <Box alignSelf="stretch" style={{ paddingTop: 4 }}>
              {receiptError ? <Text variant="bodySm" color="statusDanger">{receiptError}</Text> : null}
              <Button label="Done" loading={withdraw.isAcknowledging} disabled={withdraw.isAcknowledging}
                onPress={() => {
                  setReceiptError(null);
                  void withdraw.acknowledge(sent.withdrawalId).then(() => router.back()).catch(() => {
                    setReceiptError('We couldn’t close this saved receipt. Try Done again.');
                  });
                }} />
            </Box>
          </Box>
        </Screen>
        <Box style={{ paddingBottom: insets.bottom }} />
      </Box>
    );
  }

  // ---------------------------------------------------------------- review
  const reviewAccount = pendingIntent?.account ?? activeAccount;
  if (step === 'review' && reviewAccount) {
    const remaining = Math.max(0, available - amountKobo);
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar title="Confirm withdrawal" showBack={!pendingIntent} inset onBack={() => setStep('form')} />
        <Screen scroll>
          <Box style={{ gap: 20 }}>
            {/* the amount, owned by the emerald hero so it reads as "real money" */}
            <Box borderRadius="lg" style={[{ backgroundColor: theme.colors.brandEmerald, padding: 20, gap: 6 }, shadowMd]}>
              <Text variant="overline" color="accentGold">YOU’RE WITHDRAWING</Text>
            <Text style={{ fontFamily: fonts.displayBlack, fontSize: 40, lineHeight: 44, letterSpacing: -1.5 }} color="inverseInk">
                {money(amountKobo)}
              </Text>
            </Box>

            <Box backgroundColor="bgSurface" borderWidth={1} borderColor="borderDefault" borderRadius="lg" padding="400" style={{ gap: 12 }}>
              <ReceiptRow label="To" value={reviewAccount.accountName} strong />
              {reviewAccount.accountNumber ? <ReceiptRow label="Account" value={`${reviewAccount.bankCode} ••${reviewAccount.accountNumber.slice(-4)}`} /> : null}
              <Box height={1} backgroundColor="borderDefault" />
              <Box flexDirection="row" alignItems="center" style={{ gap: 8 }}>
                <Icon name="check-circle" size={16} color="statusSuccess" />
                <Text variant="bodySm" color="inkDefault" style={{ flex: 1 }}>No fee — you receive the full amount.</Text>
              </Box>
              {!pendingIntent ? <ReceiptRow label="Balance after" value={money(remaining)} /> : null}
            </Box>

            {submitError ? (
              <Box flexDirection="row" alignItems="center" backgroundColor="statusDangerTint" borderRadius="md" padding="300" style={{ gap: 8 }}>
                <Icon name="alert-circle" size={16} color="statusDanger" />
                <Text variant="bodySm" color="statusDanger" style={{ flex: 1 }}>{submitError}</Text>
              </Box>
            ) : null}

            <Box style={{ gap: 8 }}>
              <Button
                label={withdraw.isPending ? 'Checking…' : pendingIntent ? 'Check withdrawal' : `Withdraw ${money(amountKobo)}`}
                onPress={onConfirm}
                loading={withdraw.isPending}
                disabled={withdraw.isPending}
              />
              <Button label="Edit" variant="ghost" onPress={() => setStep('form')} disabled={withdraw.isPending || !!pendingIntent} />
            </Box>
          </Box>
        </Screen>
        <Box style={{ paddingBottom: insets.bottom }} />
      </Box>
    );
  }

  // ---------------------------------------------------------------- form
  if (withdraw.restoreError) {
    return <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Withdraw" showBack inset />
      <Screen><Text variant="body">We couldn’t check for a saved withdrawal. Try again before starting a new one.</Text>
        <Button label="Try again" onPress={() => { void withdraw.retryRestore(); }} /></Screen>
    </Box>;
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
            <Text variant="overline" color="inkMuted">AVAILABLE</Text>
            <Text variant="h1" color="brandEmerald">{money(available)}</Text>
          </Box>

          {accounts.isLoading ? (
            <Loading />
          ) : list.length > 0 ? (
            <Box style={{ gap: 12 }}>
              <Text variant="headingS">To account</Text>
              {list.map((a) => (
                <OptionCard
                  key={a.id}
                  title={a.accountName}
                  subtitle={`${a.bankCode} · ••${a.accountNumber.slice(-4)}`}
                  selected={activeId === a.id}
                  onPress={() => setSelected(a.id)}
                />
              ))}
              <Field label="Amount (₦)" error={amountError ?? undefined}>
                <Input value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="0" />
              </Field>
              {available > 0 ? (
                <Pressable
                  onPress={() => setAmount(String(Math.floor(available / 100)))}
                  accessibilityRole="button"
                  accessibilityLabel={`Withdraw all, ${money(available)}`}
                  hitSlop={8}
                  style={{ alignSelf: 'flex-start' }}
                >
                  <Text variant="label" color="brandEmerald">Withdraw all ({money(available)})</Text>
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
            <Box style={{ gap: 12 }}>
              <Text variant="headingS">Add a bank account</Text>

              <Field label="Bank">
                <Pressable
                  onPress={() => {
                    Keyboard.dismiss(); // close the number pad before the sheet animates up (no jank)
                    setBankModal(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Select your bank"
                >
                  <Box
                    flexDirection="row"
                    alignItems="center"
                    justifyContent="space-between"
                    backgroundColor="bgSurface"
                    borderWidth={1}
                    borderColor="borderDefault"
                    borderRadius="md"
                    style={{ paddingHorizontal: 16, paddingVertical: 14, gap: 12 }}
                  >
                    <Text variant="body" color={bank ? 'inkStrong' : 'inkFaint'} numberOfLines={1} style={{ flex: 1 }}>
                      {bank?.name ?? 'Select your bank'}
                    </Text>
                    <Icon name="chevron-down" size={20} color="inkMuted" />
                  </Box>
                </Pressable>
              </Field>

              <Field label="Account number">
                <Input
                  value={accountNumber}
                  onChangeText={(t) => setAccountNumber(t.replace(/\D/g, '').slice(0, 10))}
                  keyboardType="number-pad"
                  placeholder="0123456789"
                  maxLength={10}
                />
              </Field>

              {/* resolved name confirmation (the bank-app reassurance step) */}
              {resolve.isPending ? (
                <Box flexDirection="row" alignItems="center" style={{ gap: 8 }}>
                  <Icon name="loader" size={16} color="inkMuted" />
                  <Text variant="bodySm" color="inkMuted">Verifying account…</Text>
                </Box>
              ) : resolvedName ? (
                <Box
                  flexDirection="row"
                  alignItems="center"
                  backgroundColor="brandEmeraldTintWeak"
                  borderRadius="md"
                  padding="300"
                  style={{ gap: 8 }}
                >
                  <Icon name="check-circle" size={18} color="brandEmerald" />
                  <Text variant="label" color="brandEmerald" style={{ flex: 1 }} numberOfLines={1}>
                    {resolvedName}
                  </Text>
                </Box>
              ) : resolveError ? (
                <Text variant="bodySm" color="statusDanger">{resolveError}</Text>
              ) : addHint ? (
                <Text variant="bodySm" color="inkMuted">{addHint}</Text>
              ) : null}

              <Button
                label={addAccount.isPending ? 'Adding…' : 'Add account'}
                onPress={onAdd}
                loading={addAccount.isPending}
                disabled={!resolvedName || addAccount.isPending}
              />
            </Box>
          )}
        </Box>
      </Screen>

      <BankSelectModal
        visible={bankModal}
        selectedCode={bank?.code ?? null}
        onSelect={(b) => {
          setBank(b);
          setBankModal(false);
        }}
        onClose={() => setBankModal(false)}
      />
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
/** Guidance shown while the add-account form can't yet submit (no bank / short number). */
function addAccountHint(bank: Bank | null, accountNumber: string): string | null {
  if (!bank) return 'Pick your bank, then enter your 10-digit account number.';
  if (accountNumber.length === 0) return 'Enter your 10-digit account number.';
  if (accountNumber.length < 10) return 'Enter all 10 digits of your account number.';
  return null;
}

function getAmountError(amount: string, amountKobo: number, valid: boolean, available: number): string | null {
  if (amount.length === 0 || valid) return null;
  if (amountKobo > available) return 'That’s more than your available balance.';
  return 'Enter an amount above ₦0.';
}

/** Label/value row used by the review + done receipts. */
function ReceiptRow({ label, value, strong }: Readonly<{ label: string; value: string; strong?: boolean }>): React.JSX.Element {
  return (
    <Box flexDirection="row" alignItems="baseline" justifyContent="space-between" style={{ gap: 12 }}>
      <Text variant="bodySm" color="inkMuted">{label}</Text>
      <Text variant={strong ? 'amountM' : 'bodySm'} color={strong ? 'inkStrong' : 'inkDefault'} style={{ flex: 1, textAlign: 'right' }} numberOfLines={1}>
        {value}
      </Text>
    </Box>
  );
}
