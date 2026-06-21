/**
 * Badge — matches Figma `Badge/Verified` (8:6): emerald-tint pill, 14px check,
 * Label/M emerald text. Used for ID-verified ushers.
 */
import { useTheme, Box, Text } from '../theme/restyle.js';
import { Icon, type IconName } from './Icon.js';

interface BadgeProps {
  label?: string;
  icon?: IconName;
}

export function Badge({ label = 'Verified', icon = 'check' }: BadgeProps): React.JSX.Element {
  const theme = useTheme();
  return (
    <Box
      flexDirection="row"
      alignItems="center"
      style={{
        alignSelf: 'flex-start',
        gap: 4,
        paddingLeft: 8,
        paddingRight: 12,
        paddingVertical: 4,
        borderRadius: theme.borderRadii.pill,
        backgroundColor: theme.colors.brandEmeraldTint,
      }}
    >
      <Icon name={icon} size={14} color="brandEmerald" />
      <Text
        style={{
          fontFamily: 'PlusJakartaSans_600SemiBold',
          fontSize: 13,
          lineHeight: 16,
          letterSpacing: 0.2,
          color: theme.colors.brandEmerald,
        }}
      >
        {label}
      </Text>
    </Box>
  );
}
