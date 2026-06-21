/**
 * EmptyState — matches Figma `EmptyState` (95:44): 96px tinted icon circle,
 * Heading/M title (Fraunces 22/28), Body/M body (ink/muted, centred), an optional
 * reason box, a primary action, and an optional secondary (ghost) action.
 */
import { Box, Text } from '../theme/restyle.js';
import { IconCircle, type CircleTone } from './IconCircle.js';
import { Button } from './Button.js';
import type { IconName } from './Icon.js';

interface EmptyStateProps {
  icon: IconName;
  title: string;
  subtitle?: string;
  tone?: CircleTone;
  reason?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export function EmptyState({
  icon,
  title,
  subtitle,
  tone = 'brand',
  reason,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: EmptyStateProps): React.JSX.Element {
  return (
    <Box alignItems="center" paddingHorizontal="600" style={{ gap: 16, maxWidth: 360, alignSelf: 'center' }}>
      <IconCircle icon={icon} tone={tone} size={96} />
      <Text variant="h2" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="bodyLg" color="inkMuted" style={{ textAlign: 'center' }}>
          {subtitle}
        </Text>
      ) : null}
      {reason ? (
        <Box
          alignSelf="stretch"
          backgroundColor="bgSubtle"
          borderRadius="md"
          padding="300"
        >
          <Text variant="bodySm" color="inkDefault" style={{ textAlign: 'center' }}>
            {reason}
          </Text>
        </Box>
      ) : null}
      {actionLabel && onAction ? (
        <Box alignSelf="stretch" style={{ gap: 8 }}>
          <Button label={actionLabel} onPress={onAction} />
          {secondaryLabel && onSecondary ? (
            <Button label={secondaryLabel} variant="ghost" onPress={onSecondary} />
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}
