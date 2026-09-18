/**
 * CheckinRow — matches Figma `CheckinRow` (143:108): Avatar + Name + a state
 * line, with trailing chrome per state: CheckedIn (emerald check disc),
 * SelfCheckedIn (secondary Confirm button), Awaiting (empty outline disc).
 */
import { useTheme, Box, Text } from '../theme/restyle.js';
import { Avatar } from './Avatar.js';
import { Button } from './Button.js';
import { Icon } from './Icon.js';
import type { Theme } from '../theme/theme.js';

export type CheckinState = 'CheckedIn' | 'SelfCheckedIn' | 'Awaiting';

const STATUS_COLOR: Record<CheckinState, keyof Theme['colors']> = {
  CheckedIn: 'statusSuccess',
  SelfCheckedIn: 'accentGoldStrong',
  Awaiting: 'inkMuted',
};

interface CheckinRowProps {
  name: string;
  state: CheckinState;
  statusText: string;
  onConfirm?: () => void;
}

export function CheckinRow({
  name,
  state,
  statusText,
  onConfirm,
}: CheckinRowProps): React.JSX.Element {
  const theme = useTheme();
  return (
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
        <Text
          variant="label"
          style={{ fontSize: 15, lineHeight: 20 }}
          color="inkStrong"
          numberOfLines={1}
        >
          {name}
        </Text>
        <Text variant="bodySm" color={STATUS_COLOR[state]} numberOfLines={1}>
          {statusText}
        </Text>
      </Box>

      {state === 'CheckedIn' ? (
        <Box
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.statusSuccessTint,
          }}
        >
          <Icon name="check" size={15} color="statusSuccess" />
        </Box>
      ) : state === 'SelfCheckedIn' ? (
        <Button
          label="Confirm"
          variant="secondary"
          size="md"
          fullWidth={false}
          onPress={onConfirm}
        />
      ) : (
        <Box
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            borderWidth: 1.5,
            borderColor: theme.colors.borderStrong,
          }}
        />
      )}
    </Box>
  );
}
