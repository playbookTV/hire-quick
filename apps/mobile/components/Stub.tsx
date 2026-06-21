/**
 * Placeholder for tabs/screens slated for later phases — keeps navigation whole
 * without faking data.
 */
import { Box } from '../theme/restyle.js';
import { AppBar } from './AppBar.js';
import { EmptyState } from './EmptyState.js';
import type { IconName } from './Icon.js';

interface StubProps {
  title: string;
  icon: IconName;
  message: string;
}

export function Stub({ title, icon, message }: StubProps): React.JSX.Element {
  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title={title} inset />
      <Box flex={1} justifyContent="center">
        <EmptyState icon={icon} title={`${title} is coming soon`} subtitle={message} tone="neutral" />
      </Box>
    </Box>
  );
}
