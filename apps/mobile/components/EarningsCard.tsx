/**
 * EarningsCard — the canonical "available to withdraw" emerald hero shown on the
 * usher Home and Wallet. Extracted so the single most important surface has ONE
 * layout and treatment (critique P2: it was inlined twice, with different figure
 * sizes and two different withdraw affordances). Colours are tokenised
 * (inverseInk / accentGold — both stay legible on emerald in light AND dark), so
 * it themes correctly; `footer` carries the screen-specific action or meta row.
 */
import type { ReactNode } from 'react';
import { useTheme, Box, Text } from '../theme/restyle.js';
import { shadowMd } from '../theme/shadows.js';
import { money } from '../lib/format.js';
import { Sparkline } from './Sparkline.js';

interface EarningsCardProps {
  /** Available balance in kobo. */
  amount: number;
  /** lg (40px, Wallet) or md (32px, Home). */
  size?: 'md' | 'lg';
  /** Optional 7-day earnings sparkline (last slot = today). Hidden when total is 0. */
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
  const big = size === 'lg';
  return (
    <Box
      borderRadius="lg"
      style={[{ backgroundColor: theme.colors.brandSurface, padding: 20, gap: 12 }, shadowMd]}
    >
      <Text
        style={{
          fontFamily: 'PlusJakartaSans_700Bold',
          fontSize: 11,
          lineHeight: 14,
          letterSpacing: 1.2,
        }}
        color="onBrandAccent"
      >
        AVAILABLE TO WITHDRAW
      </Text>
      <Text
        style={{
          fontFamily: 'Fraunces_900Black',
          fontSize: big ? 40 : 32,
          lineHeight: big ? 44 : 38,
          letterSpacing: big ? -1.5 : -1,
        }}
        color="inverseInk"
      >
        {money(amount)}
      </Text>
      {weekly && weekly.total > 0 ? (
        <Box style={{ gap: 8, paddingTop: 4 }}>
          <Box flexDirection="row" alignItems="baseline" justifyContent="space-between">
            <Text
              style={{
                fontFamily: 'PlusJakartaSans_700Bold',
                fontSize: 11,
                lineHeight: 14,
                letterSpacing: 1.2,
              }}
              color="onBrandAccent"
            >
              THIS WEEK
            </Text>
            <Text
              style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, lineHeight: 20 }}
              color="inverseInk"
            >
              {money(weekly.total)}
            </Text>
          </Box>
          <Sparkline
            values={weekly.values}
            barColor={theme.colors.accentGold}
            trackColor="rgba(255,255,255,0.16)"
          />
        </Box>
      ) : null}
      {footer}
    </Box>
  );
}
