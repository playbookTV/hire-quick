/**
 * AddPhoto — matches Figma `AddPhoto` (153:115): Style = Avatar (round camera
 * chip + label), Tile (dashed 80px square with +), or Upload (dashed box with a
 * camera chip, title + subtitle) for ID/selfie capture.
 */
import { Pressable } from 'react-native';
import { useTheme, Box, Text } from '../theme/restyle.js';
import { Icon, type IconName } from './Icon.js';

export type AddPhotoStyle = 'avatar' | 'tile' | 'upload';

interface AddPhotoProps {
  variant?: AddPhotoStyle;
  title?: string;
  subtitle?: string;
  icon?: IconName;
  onPress?: () => void;
}

export function AddPhoto({
  variant = 'avatar',
  title = 'Add a photo',
  subtitle = 'Optional · builds trust',
  icon = 'camera',
  onPress,
}: AddPhotoProps): React.JSX.Element {
  const theme = useTheme();

  if (variant === 'tile') {
    return (
      <Pressable onPress={onPress}>
        <Box
          style={{
            width: 80,
            height: 80,
            borderRadius: theme.borderRadii.md,
            borderWidth: 1.5,
            borderColor: theme.colors.borderStrong,
            borderStyle: 'dashed',
            backgroundColor: theme.colors.bgSurface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="plus" size={24} color="inkMuted" />
        </Box>
      </Pressable>
    );
  }

  const chip = (size: number) => (
    <Box
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.colors.brandEmeraldTint,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={icon} size={26} color="brandEmerald" />
    </Box>
  );

  if (variant === 'upload') {
    return (
      <Pressable onPress={onPress}>
        <Box
          alignItems="center"
          style={{
            gap: 8,
            paddingHorizontal: 20,
            paddingVertical: 24,
            borderRadius: theme.borderRadii.lg,
            borderWidth: 1.5,
            borderColor: theme.colors.borderStrong,
            borderStyle: 'dashed',
            backgroundColor: theme.colors.bgSurface,
          }}
        >
          {chip(52)}
          <Text variant="titleM">{title}</Text>
          <Text variant="bodySm" color="inkMuted" style={{ textAlign: 'center' }}>
            {subtitle}
          </Text>
        </Box>
      </Pressable>
    );
  }

  // avatar
  return (
    <Pressable onPress={onPress}>
      <Box flexDirection="row" alignItems="center" style={{ gap: 16 }}>
        {chip(72)}
        <Box>
          <Text variant="label" style={{ fontSize: 15, lineHeight: 20 }} color="brandEmerald">
            {title}
          </Text>
          <Text variant="bodySm" color="inkMuted">
            {subtitle}
          </Text>
        </Box>
      </Box>
    </Pressable>
  );
}
