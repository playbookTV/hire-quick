/**
 * CoverImage — a banner surface for cards/headers. With a `uri` it renders an
 * expo-image cover under a bottom gradient scrim so overlaid text stays legible;
 * without one it falls back to a category-tinted panel with a large faint
 * watermark icon (so photo-less events still read as distinct). `children` are
 * laid over the image, bottom-aligned.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, Box } from '../theme/restyle.js';
import { Icon } from './Icon.js';
import { categoryLook } from './CategoryBadge.js';

interface CoverImageProps {
  uri?: string | null;
  /** Used to pick the fallback tint + watermark icon when there's no uri. */
  category?: string;
  height?: number;
  radius?: number;
  children?: React.ReactNode;
}

export function CoverImage({ uri, category = 'Other', height = 140, radius = 16, children }: CoverImageProps): React.JSX.Element {
  const theme = useTheme();
  const look = categoryLook(category);

  return (
    <Box style={{ height, borderRadius: radius, overflow: 'hidden' }} backgroundColor={look.bg}>
      {uri ? (
        <>
          <Image
            source={{ uri }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={150}
          />
          <LinearGradient
            colors={['transparent', 'rgba(20,19,14,0.55)']}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: height * 0.7 }}
          />
        </>
      ) : (
        <Box style={{ position: 'absolute', right: -8, bottom: -8, opacity: 0.18 }}>
          <Icon name={look.icon} size={Math.round(height * 0.7)} color={look.fg} />
        </Box>
      )}
      {children ? (
        <Box style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: theme.spacing['400'] }}>
          {children}
        </Box>
      ) : null}
    </Box>
  );
}
