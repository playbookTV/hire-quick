/**
 * Next weekly payout, shown on the wallet in place of Withdraw while payout
 * runs are on: the Thursday run date in Lagos time, the amount it would pay
 * (the whole available balance), the payout account, and why nothing will be
 * paid when there is no account or the balance is under the minimum.
 */
import { Box, Text } from '../theme/restyle.js';
import { Card } from './Card.js';
import { Icon } from './Icon.js';
import { Banner } from './Banner.js';
import { Button } from './Button.js';
import { KeyValueRow } from './KeyValueRow.js';
import { useBanks } from '../lib/hooks.js';
import {
  formatPayoutDate,
  maskedAccountLabel,
  nextPayoutDate,
  payoutAmountLabel,
  payoutPlan,
  payoutPlanCopy,
  payoutRunToday,
} from '../lib/payouts.js';
import type { WalletSummary } from '../lib/types.js';

interface NextPayoutCardProps {
  wallet: WalletSummary;
  onChooseAccount: () => void;
}

export function NextPayoutCard({
  wallet,
  onChooseAccount,
}: Readonly<NextPayoutCardProps>): React.JSX.Element {
  const banks = useBanks();
  const now = new Date();
  const at = nextPayoutDate(wallet, now);
  const when = formatPayoutDate(at, now);
  const plan = payoutPlan(wallet);
  const copy = payoutPlanCopy(plan);
  const account = wallet.payoutAccount ?? null;
  return (
    <Card>
      <Box gap="300">
        <Box gap="100">
          <Box flexDirection="row" alignItems="center" gap="200">
            <Icon name="calendar" size={18} color="brandEmerald" />
            <Text variant="labelLg">Next payout</Text>
          </Box>
          <Text variant="headingS" accessibilityLabel={`Next payout ${when}, Lagos time`}>
            {when}
          </Text>
          <Text variant="bodySm" color="inkMuted">
            Lagos time. Payouts are sent every Thursday.
          </Text>
          {payoutRunToday(now) ? (
            <Text variant="bodySm" color="inkMuted">
              Today’s payout is being processed. If your balance is in it, you’ll get a notification
              when the transfer is sent.
            </Text>
          ) : null}
        </Box>
        <Box height={1} backgroundColor="borderDefault" />
        <Box>
          <KeyValueRow
            label="Amount"
            value={payoutAmountLabel(plan)}
            tone={plan.status === 'scheduled' ? 'brand' : 'muted'}
            emphasize={plan.status === 'scheduled'}
          />
          {account ? (
            <>
              <KeyValueRow label="To" value={account.accountName} />
              <KeyValueRow
                label="Account"
                value={maskedAccountLabel(account.bankCode, account.last4, banks.data)}
              />
            </>
          ) : (
            <KeyValueRow label="To" value="No payout account" tone="muted" />
          )}
        </Box>
        <Banner tone={copy.tone} title={copy.title} message={copy.message} />
        <Button
          label={account ? 'Change payout account' : 'Add payout account'}
          variant={account ? 'secondary' : 'primary'}
          onPress={onChooseAccount}
        />
      </Box>
    </Card>
  );
}
