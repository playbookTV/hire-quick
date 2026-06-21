/**
 * SectionHeader — title + optional action link (Figma SectionHeader:
 * Title/Action/Show action).
 */
import { Pressable } from 'react-native';
import { Box, Text } from '../theme/restyle.js';

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps): React.JSX.Element {
  return (
    <Box flexDirection="row" alignItems="center" justifyContent="space-between" marginBottom="300">
      <Text variant="h2">{title}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text variant="label" color="brandEmerald">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </Box>
  );
}
