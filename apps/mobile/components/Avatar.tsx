/**
 * Avatar — initials on an emerald tint (Figma Avatar). Image variant comes later.
 */
import { useTheme, Box, Text } from '../theme/restyle.js';

interface AvatarProps {
  name?: string | null;
  size?: number;
}

function initials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export function Avatar({ name, size = 44 }: AvatarProps): React.JSX.Element {
  const theme = useTheme();
  return (
    <Box
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.colors.brandBg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: size * 0.38, color: theme.colors.brandEmerald }}>
        {initials(name)}
      </Text>
    </Box>
  );
}
