/**
 * MetaRow — small icon + text, for event meta (date, venue, dress code).
 */
import { Box, Text } from '../theme/restyle.js';
import { Icon, type IconName } from './Icon.js';

interface MetaRowProps {
  icon: IconName;
  text: string;
}

export function MetaRow({ icon, text }: MetaRowProps): React.JSX.Element {
  return (
    <Box flexDirection="row" alignItems="center" gap="200" marginBottom="150">
      <Icon name={icon} size={15} color="inkMuted" />
      <Text variant="bodySm" color="inkMuted" style={{ flex: 1 }}>
        {text}
      </Text>
    </Box>
  );
}
