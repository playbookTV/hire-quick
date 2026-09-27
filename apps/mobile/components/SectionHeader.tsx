/** Figma SectionHeading: compact uppercase label and reachable text action. */
import { useState } from 'react';
import { Pressable } from 'react-native';
import { Box, Text, useTheme } from '../theme/restyle.js';
interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  appearance?: 'overline' | 'heading';
}
export function SectionHeader({
  title,
  actionLabel,
  onAction,
  appearance = 'overline',
}: SectionHeaderProps): React.JSX.Element {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Box
      flexDirection="row"
      alignItems="center"
      justifyContent="space-between"
      gap="200"
      marginBottom="400"
    >
      <Text
        variant={appearance === 'heading' ? 'headingS' : 'overline'}
        color="inkMuted"
        style={{ flex: 1, textTransform: appearance === 'overline' ? 'uppercase' : 'none' }}
      >
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            minHeight: 44,
            marginVertical: -12,
            minWidth: 44,
            maxWidth: '50%',
            justifyContent: 'center',
            outlineWidth: focused ? 3 : 0,
            outlineColor: theme.colors.borderFocus,
            borderRadius: theme.borderRadii.xxs,
          }}
        >
          <Text variant="label" color="inkStrong">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </Box>
  );
}
