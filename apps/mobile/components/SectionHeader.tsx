/**
 * SectionHeader — matches Figma `SectionHeader` (89:10): Heading/S title
 * (Fraunces 18/24) + optional "see all" action (Label/M, emerald).
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
      <Text variant="headingS">{title}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text
            style={{
              fontFamily: 'PlusJakartaSans_600SemiBold',
              fontSize: 13,
              lineHeight: 16,
              letterSpacing: 0.2,
            }}
            color="brandEmerald"
          >
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </Box>
  );
}
