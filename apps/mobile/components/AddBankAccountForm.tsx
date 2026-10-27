/**
 * Add a bank account the way a bank app does: pick a bank, type the 10-digit
 * account number, and the account name is resolved (`useResolveAccount`) before
 * saving. Shared by the withdraw flow and the payout-account chooser.
 */
import { useEffect, useState } from 'react';
import { Pressable, Keyboard } from 'react-native';
import { Box, Text } from '../theme/restyle.js';
import { Field } from './Field.js';
import { Input } from './Input.js';
import { Button } from './Button.js';
import { Icon } from './Icon.js';
import { BankSelectModal } from './BankSelectModal.js';
import { useAddBankAccount, useResolveAccount } from '../lib/hooks.js';
import type { Bank, BankAccount } from '../lib/types.js';

interface AddBankAccountFormProps {
  /** Called with the saved account. */
  onAdded: (account: BankAccount) => void;
  /** Offers "Use a saved account" when the usher already has accounts. */
  onCancel?: () => void;
}

export function AddBankAccountForm({
  onAdded,
  onCancel,
}: Readonly<AddBankAccountFormProps>): React.JSX.Element {
  const addAccount = useAddBankAccount();
  const resolve = useResolveAccount();
  const [bank, setBank] = useState<Bank | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [bankModal, setBankModal] = useState(false);
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolveAttempt, setResolveAttempt] = useState(0);

  // Each input revision owns its result. Incomplete edits invalidate in-flight work.
  useEffect(() => {
    let current = true;
    setResolvedName(null);
    setResolveError(null);
    if (!bank || accountNumber.length !== 10) return;
    resolve.mutate(
      { bankCode: bank.code, accountNumber },
      {
        onSuccess: (result) => {
          if (current) setResolvedName(result.accountName);
        },
        onError: () => {
          if (current)
            setResolveError(
              "Couldn't verify this account. Check the number and bank, then try again.",
            );
        },
      },
    );
    return () => {
      current = false;
    };
    // Trigger only when the user changes the lookup or explicitly retries it.
  }, [bank, accountNumber, resolveAttempt]);

  const onAdd = (): void => {
    if (!bank || !resolvedName) return;
    addAccount.mutate(
      { bankCode: bank.code, accountNumber },
      {
        onSuccess: (account) => {
          setBank(null);
          setAccountNumber('');
          setResolvedName(null);
          onAdded(account);
        },
        onError: () => setResolveError('Couldn’t add this account. Please try again.'),
      },
    );
  };

  // Why the "Add account" button is disabled, so the form isn't a silent dead end.
  const addHint = addAccountHint(bank, accountNumber);

  return (
    <Box style={{ gap: 12 }}>
      <Text variant="headingS">Add a bank account</Text>
      {onCancel ? (
        <Button
          label="Use a saved account"
          variant="ghost"
          disabled={addAccount.isPending}
          onPress={onCancel}
        />
      ) : null}

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
            <Text
              variant="body"
              color={bank ? 'inkStrong' : 'inkFaint'}
              numberOfLines={1}
              style={{ flex: 1 }}
            >
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
          <Text variant="bodySm" color="inkMuted">
            Verifying account…
          </Text>
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
        <Box style={{ gap: 8 }}>
          <Text variant="bodySm" color="statusDanger" accessibilityRole="alert">
            {resolveError}
          </Text>
          <Button
            label="Try account lookup again"
            variant="secondary"
            size="md"
            onPress={() => setResolveAttempt((attempt) => attempt + 1)}
          />
        </Box>
      ) : addHint ? (
        <Text variant="bodySm" color="inkMuted">
          {addHint}
        </Text>
      ) : null}

      <Button
        label={addAccount.isPending ? 'Adding…' : 'Add account'}
        onPress={onAdd}
        loading={addAccount.isPending}
        disabled={!resolvedName || addAccount.isPending}
      />

      <BankSelectModal
        visible={bankModal}
        selectedCode={bank?.code ?? null}
        onSelect={(b) => {
          setBank(b);
          setBankModal(false);
        }}
        onClose={() => setBankModal(false)}
      />
    </Box>
  );
}

/** Guidance shown while the add-account form can't yet submit (no bank / short number). */
function addAccountHint(bank: Bank | null, accountNumber: string): string | null {
  if (!bank) return 'Pick your bank, then enter your 10-digit account number.';
  if (accountNumber.length === 0) return 'Enter your 10-digit account number.';
  if (accountNumber.length < 10) return 'Enter all 10 digits of your account number.';
  return null;
}
