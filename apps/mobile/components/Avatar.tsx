/**
 * Avatar — matches Figma `Avatar` (8:2): a soft emerald-tint circle with a
 * subtle diagonal wash and emerald initials (Label/L). 48px default; scales.
 * When `imageUrl` is set it renders the real photo; otherwise it falls back to
 * the gradient initials.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, Text } from '../theme/restyle.js';

interface AvatarProps {
  name?: string | null;
  size?: number;
  imageUrl?: string | null;
}

function initials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export function Avatar({ name, size = 48, imageUrl }: AvatarProps): React.JSX.Element {
  const theme = useTheme();
  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors.bgSubtle }}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={150}
        recyclingKey={imageUrl}
      />
    );
  }
  return (
    <LinearGradient
      colors={[theme.colors.brandEmeraldTint, theme.colors.statusSuccessTint]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontFamily: 'PlusJakartaSans_600SemiBold',
          fontSize: Math.round(size * 0.32),
          lineHeight: Math.round(size * 0.42),
          color: theme.colors.brandEmerald,
        }}
      >
        {initials(name)}
      </Text>
    </LinearGradient>
  );
}
