/**
 * Thin wrapper over Feather (bundled with Expo). Maps to a theme colour key so
 * icons recolour with light/dark like everything else.
 */
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme/restyle.js';
import type { Theme } from '../theme/theme.js';

export type IconName = keyof typeof Feather.glyphMap;

interface IconProps {
  name: IconName;
  size?: number;
  color?: keyof Theme['colors'];
}

export function Icon({ name, size = 20, color = 'inkBody' }: IconProps): React.JSX.Element {
  const theme = useTheme();
  return <Feather name={name} size={size} color={theme.colors[color]} />;
}
