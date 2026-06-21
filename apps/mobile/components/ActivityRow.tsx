/**
 * ActivityRow — matches Figma `ActivityRow` (92:59): wallet transaction row.
 * Type (Credit/Debit/Pending) sets the icon chip, amount colour, and the small
 * overline status pill. Bordered surface, radius md, 12px padding.
 */
import { useTheme, Box, Text } from '../theme/restyle.js';
import { Icon, type IconName } from './Icon.js';
import type { Theme } from '../theme/theme.js';

export type ActivityType = 'credit' | 'debit' | 'pending';

interface Style {
  chipBg: keyof Theme['colors'];
  icon: IconName;
  iconColor: keyof Theme['colors'];
  amountColor: keyof Theme['colors'];
  pillBg: keyof Theme['colors'];
  pillFg: keyof Theme['colors'];
  pill: string;
}

const TYPE: Record<ActivityType, Style> = {
  credit: { chipBg: 'statusSuccessTint', icon: 'arrow-up', iconColor: 'statusSuccess', amountColor: 'statusSuccess', pillBg: 'statusSuccessTint', pillFg: 'statusSuccess', pill: 'RELEASED' },
  debit: { chipBg: 'bgInset', icon: 'arrow-down', iconColor: 'inkDefault', amountColor: 'inkStrong', pillBg: 'bgSubtle', pillFg: 'inkMuted', pill: 'PAID' },
  pending: { chipBg: 'accentGoldTint', icon: 'clock', iconColor: 'accentGoldStrong', amountColor: 'accentGoldStrong', pillBg: 'accentGoldTint', pillFg: 'accentGoldStrong', pill: 'PENDING' },
};

interface ActivityRowProps {
  type: ActivityType;
  title: string;
  subtitle: string;
  amount: string;
  statusLabel?: string;
}

export function ActivityRow({ type, title, subtitle, amount, statusLabel }: ActivityRowProps): React.JSX.Element {
  const theme = useTheme();
  const s = TYPE[type];
  return (
    <Box
      flexDirection="row"
      alignItems="center"
      backgroundColor="bgSurface"
      borderWidth={1}
      borderColor="borderDefault"
      borderRadius="md"
      padding="300"
      style={{ gap: 12 }}
    >
      <Box
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors[s.chipBg],
        }}
      >
        <Icon name={s.icon} size={20} color={s.iconColor} />
      </Box>

      <Box flex={1}>
        <Text variant="label" style={{ fontSize: 15, lineHeight: 20 }} color="inkStrong" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="bodySm" color="inkMuted" numberOfLines={1}>
          {subtitle}
        </Text>
      </Box>

      <Box alignItems="flex-end" style={{ gap: 3 }}>
        <Text variant="amountM" color={s.amountColor}>
          {amount}
        </Text>
        <Box
          style={{
            backgroundColor: theme.colors[s.pillBg],
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: theme.borderRadii.pill,
          }}
        >
          <Text
            style={{
              fontFamily: 'PlusJakartaSans_700Bold',
              fontSize: 11,
              lineHeight: 14,
              letterSpacing: 1.2,
              color: theme.colors[s.pillFg],
            }}
          >
            {statusLabel ?? s.pill}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
