/**
 * EmptyState — icon + title + subtitle + optional actions (Figma EmptyState:
 * Tone Brand/Danger, Show secondary).
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
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: EmptyStateProps): React.JSX.Element {
  return (
    <Box alignItems="center" paddingVertical="1200" paddingHorizontal="600" gap="300">
      <IconCircle icon={icon} tone={tone} size={64} />
      <Text variant="h2" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="body" color="inkMuted" style={{ textAlign: 'center' }}>
          {subtitle}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Box marginTop="300" alignSelf="stretch" gap="200">
          <Button label={actionLabel} onPress={onAction} />
          {secondaryLabel && onSecondary ? (
            <Button label={secondaryLabel} variant="ghost" onPress={onSecondary} />
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}
