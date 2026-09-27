import { useWindowDimensions } from 'react-native';
import { Box, Text } from '../theme/restyle.js';

export type ActivityType = 'credit' | 'debit' | 'pending';
/** Figma TransactionRow. The API subtitle supplies the actual ledger/transfer status. */
export function ActivityRow({
  type,
  title,
  subtitle,
  amount,
  statusLabel,
}: {
  type: ActivityType;
  title: string;
  subtitle: string;
  amount: string;
  statusLabel?: string;
}): React.JSX.Element {
  const { width, fontScale } = useWindowDimensions();
  const stack = width / fontScale < 340;
  return (
    <Box paddingVertical="400" borderBottomWidth={1} borderBottomColor="borderDefault" gap="150">
      <Box
        flexDirection={stack ? 'column' : 'row'}
        alignItems={stack ? 'flex-start' : 'baseline'}
        gap="300"
      >
        <Text variant="labelLg" style={{ flex: stack ? undefined : 1 }}>
          {title}
        </Text>
        <Text variant="amountM" color={type === 'pending' ? 'moneyHeld' : 'inkStrong'}>
          {amount}
        </Text>
      </Box>
      <Text variant="bodySm" color="inkMuted">
        {statusLabel ? `${statusLabel} · ` : ''}
        {subtitle}
      </Text>
    </Box>
  );
}
