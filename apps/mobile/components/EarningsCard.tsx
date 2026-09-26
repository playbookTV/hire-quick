/** Figma BalanceHero, shared by Home and Wallet; values always come from live data. */
import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import { useTheme, Box, Text } from '../theme/restyle.js';
import { money } from '../lib/format.js';
import { Sparkline } from './Sparkline.js';
interface EarningsCardProps {
  amount: number;
  size?: 'md' | 'lg';
  weekly?: { values: number[]; total: number };
  footer?: ReactNode;
}
export function EarningsCard({
  amount,
  size = 'lg',
  weekly,
  footer,
}: Readonly<EarningsCardProps>): React.JSX.Element {
  const theme = useTheme();
  return (
    <Box borderRadius="xl" backgroundColor="bgElevated" padding="600" gap="150">
      <Text variant="label" color="inkOnElevatedMuted">
        Available to withdraw
      </Text>
      {/* Keep currency digits grouped at large text sizes without shrinking the user's font. */}
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ flexGrow: 1 }}>
        <Text
          variant={size === 'lg' ? 'amountXL' : 'amount'}
          color="brandAccentOnElevated"
          numberOfLines={1}
        >
          {money(amount)}
        </Text>
      </ScrollView>
      {weekly && weekly.total > 0 ? (
        <Box gap="200" paddingTop="100">
          <Box
            flexDirection="row"
            flexWrap="wrap"
            alignItems="baseline"
            justifyContent="space-between"
            gap="200"
          >
            <Text variant="label" color="inkOnElevatedMuted">
              This week
            </Text>
            <Text variant="labelLg" color="inkOnElevated">
              {money(weekly.total)}
            </Text>
          </Box>
          <Sparkline
            values={weekly.values}
            barColor={theme.colors.brandAccentOnElevated}
            trackColor={theme.colors.borderStrong}
          />
        </Box>
      ) : null}
      {footer ? <Box marginTop="200">{footer}</Box> : null}
    </Box>
  );
}
