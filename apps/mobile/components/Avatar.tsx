/** Shared avatar tones, with real photos and an initials fallback. */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';
import { useState } from 'react';
import { useTheme, Box, Text } from '../theme/restyle.js';
import { canvasTokens } from '../theme/token-manager.js';
import { fonts } from '../theme/fonts.js';

interface AvatarProps {
  name?: string | null;
  size?: number;
  imageUrl?: string | null;
  tone?: 'neutral' | 'accent' | 'muted' | 'unread';
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
          tone === 'neutral'
            ? theme.colors.bgElevated
            : tone === 'muted'
              ? theme.colors.bgSurfaceAlt
              : theme.colors.brandAccentSubtle,
        borderWidth: tone === 'accent' ? 1 : 0,
        borderColor: theme.colors.accentBorder,
      }}
    >
      {tone === 'neutral' ? (
        <LinearGradient
          colors={canvasTokens.elevatedGradient}
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
        />
      ) : null}
      <Text
        style={{
          fontFamily: tone === 'unread' ? fonts.sansBold : theme.textVariants.labelLg.fontFamily,
          fontSize: Math.min(20, Math.round(size * 0.32)),
          lineHeight: Math.min(26, Math.round(size * 0.42)),
          color:
            tone === 'neutral'
              ? theme.colors.inkOnElevated
              : tone === 'muted'
                ? theme.colors.inkMuted
                : tone === 'unread'
                  ? theme.colors.brandAccentText
                  : theme.colors.inkStrong,
        }}
      >
        {initials(name)}
      </Text>
    </Box>
  );
}
