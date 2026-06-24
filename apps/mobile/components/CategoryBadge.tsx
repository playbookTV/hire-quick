/**
 * CategoryBadge — a tinted pill that gives each event category a distinct icon +
 * colour so event surfaces aren't a wall of identical text. `category` is a
 * free-form string (DTO allows any), so we keyword-match it to a known look and
 * fall back to a neutral "tag" pill for anything unrecognised. Colours reuse
 * existing semantic tint tokens — no new palette.
 */
import { useTheme, Box, Text } from '../theme/restyle.js';
import { Icon, type IconName } from './Icon.js';
import type { Theme } from '../theme/theme.js';

export type CategoryLook = { icon: IconName; bg: keyof Theme['colors']; fg: keyof Theme['colors'] };

const NEUTRAL: CategoryLook = { icon: 'tag', bg: 'bgInset', fg: 'inkMuted' };

// Keyword → look. First substring match wins (so "Corporate event" → corporate).
const LOOKS: Array<{ match: string; look: CategoryLook }> = [
  { match: 'wedding', look: { icon: 'heart', bg: 'statusDangerTint', fg: 'statusDanger' } },
  { match: 'corporate', look: { icon: 'briefcase', bg: 'statusInfoTint', fg: 'statusInfo' } },
  { match: 'conference', look: { icon: 'mic', bg: 'statusInfoTint', fg: 'statusInfo' } },
  { match: 'concert', look: { icon: 'music', bg: 'accentGoldTint', fg: 'accentGoldStrong' } },
  { match: 'party', look: { icon: 'gift', bg: 'statusWarningTint', fg: 'statusWarning' } },
  { match: 'launch', look: { icon: 'package', bg: 'statusSuccessTint', fg: 'statusSuccess' } },
  { match: 'product', look: { icon: 'package', bg: 'statusSuccessTint', fg: 'statusSuccess' } },
  { match: 'religious', look: { icon: 'star', bg: 'brandEmeraldTint', fg: 'brandEmeraldStrong' } },
];

/** Resolve a category string to its icon + colour look (shared with CoverImage / EventCard). */
export function categoryLook(category: string): CategoryLook {
  const c = category.toLowerCase();
  return LOOKS.find((l) => c.includes(l.match))?.look ?? NEUTRAL;
}

interface CategoryBadgeProps {
  category: string;
  size?: 'sm' | 'md';
}

export function CategoryBadge({ category, size = 'md' }: CategoryBadgeProps): React.JSX.Element {
  const theme = useTheme();
  const look = categoryLook(category);
  const iconSize = size === 'sm' ? 12 : 14;
  const fontSize = size === 'sm' ? 11 : 12;

  return (
    <Box
      flexDirection="row"
      alignItems="center"
      alignSelf="flex-start"
      style={{
        gap: 5,
        paddingHorizontal: size === 'sm' ? 8 : 10,
        paddingVertical: size === 'sm' ? 3 : 5,
        borderRadius: theme.borderRadii.pill,
        backgroundColor: theme.colors[look.bg],
      }}
    >
      <Icon name={look.icon} size={iconSize} color={look.fg} />
      <Text
        style={{
          fontFamily: 'PlusJakartaSans_600SemiBold',
          fontSize,
          lineHeight: fontSize + 4,
          color: theme.colors[look.fg],
        }}
        numberOfLines={1}
      >
        {category}
      </Text>
    </Box>
  );
}
