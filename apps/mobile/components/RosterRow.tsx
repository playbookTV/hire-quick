/**
 * RosterRow — matches Figma `RosterRow` (123:76): Avatar + Name/Role + a trailing
 * StatusPill over an amount line. Bordered surface, radius md, 12px padding.
 */
import { Pressable } from 'react-native';
import { Box, Text } from '../theme/restyle.js';
import { Avatar } from './Avatar.js';
import { StatusPill } from './StatusPill.js';

interface RosterRowProps {
  name: string;
  role: string;
  status: string;
  amount?: string;
  onPress?: () => void;
}

export function RosterRow({ name, role, status, amount, onPress }: RosterRowProps): React.JSX.Element {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed && onPress ? 0.92 : 1 })}>
      <Box
        flexDirection="row"
        alignItems="center"
        backgroundColor="bgSurface"
        borderWidth={1}
        borderColor="borderDefault"
        borderRadius="md"
        padding="300"
        style={{ gap: 12 }}
      >
        <Avatar name={name} size={40} />
        <Box flex={1}>
          <Text variant="label" style={{ fontSize: 15, lineHeight: 20 }} color="inkStrong" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="bodySm" color="inkMuted" numberOfLines={1}>
            {role}
          </Text>
        </Box>
        <Box alignItems="flex-end" style={{ gap: 2 }}>
          <StatusPill status={status} />
          {amount ? (
            <Text variant="bodySm" color="inkMuted">
              {amount}
            </Text>
          ) : null}
        </Box>
      </Box>
    </Pressable>
  );
}
