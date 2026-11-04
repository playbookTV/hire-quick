/** Figma BalanceHero, shared by Home and Wallet; values always come from live data. */
import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import { useTheme, Box, Text } from '../theme/restyle.js';
import { money } from '../lib/format.js';
import { Sparkline } from './Sparkline.js';
import { Card } from './Card.js';
interface EarningsCardProps {
  amount: number;
  /** Weekly payout runs pay the balance out, so there is nothing to withdraw. */
  label?: string;
  size?: 'md' | 'lg';
  amountTone?: 'white' | 'accent';
  weekly?: { values: number[]; total: number };
  footer?: ReactNode;
}
export function EarningsCard({
  amount,
  label = 'Available to withdraw',
  size = 'lg',
  amountTone = 'white',
  weekly,
  footer,
}: Readonly<EarningsCardProps>): React.JSX.Element {
  const theme = useTheme();
  return (
    <Card variant="elevated" radius="xl" padding="600">
      <Box gap="150">
        <Text variant="label" color="inkOnElevatedMuted">
          {label}
        </Text>
        {/* Keep currency digits grouped at large text sizes without shrinking the user's font. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <Text
            variant={size === 'lg' ? 'amountXL' : 'amount'}
            color={amountTone === 'accent' ? 'brandAccentOnElevated' : 'inkOnPrimary'}
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
              gradientTrack
            />
          </Box>
        ) : null}
        {footer ? <Box marginTop="200">{footer}</Box> : null}
      </Box>
    </Card>
  );
}
