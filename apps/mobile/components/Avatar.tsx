/** Figma Avatar: flat neutral/accent initials, or a photo with an initials fallback. */
import { Image } from 'expo-image';
import { useState } from 'react';
import { useTheme, Box, Text } from '../theme/restyle.js';

interface AvatarProps {
  name?: string | null;
  size?: number;
  imageUrl?: string | null;
  tone?: 'neutral' | 'accent';
}

function initials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export function Avatar({
  name,
  size = 48,
  imageUrl,
  tone = 'neutral',
}: AvatarProps): React.JSX.Element {
  const theme = useTheme();
  const [failedUrl, setFailedUrl] = useState<string>();
  if (imageUrl && imageUrl !== failedUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.colors.bgSubtle,
        }}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={150}
        recyclingKey={imageUrl}
        onError={() => setFailedUrl(imageUrl)}
      />
    );
  }
  return (
    <Box
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        backgroundColor:
          tone === 'accent' ? theme.colors.brandAccentSubtle : theme.colors.bgInverse,
      }}
    >
      <Text
        style={{
          fontFamily: theme.textVariants.labelLg.fontFamily,
          fontSize: Math.min(20, Math.round(size * 0.32)),
          lineHeight: Math.min(26, Math.round(size * 0.42)),
          color: tone === 'accent' ? theme.colors.inkStrong : theme.colors.inkInverse,
        }}
      >
        {initials(name)}
      </Text>
    </Box>
  );
}
