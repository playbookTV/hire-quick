import { StatusBar } from 'expo-status-bar';
import { Box, Text } from '../theme/restyle.js';
import { primitiveTokens } from '../theme/token-manager.js';
import { BrandMark } from './BrandMark.js';

/** Real OS status/home bars surround the launch artwork; no simulated system UI. */
export function LaunchScreen(): React.JSX.Element {
  return (
    <Box
      flex={1}
      justifyContent="center"
      alignItems="center"
      gap="600"
      style={{ backgroundColor: primitiveTokens['neutral/950'] }}
      accessibilityLabel="Loading HireQuick"
      accessibilityState={{ busy: true }}
    >
      <StatusBar style="light" />
      <BrandMark />
      <Text variant="splashWordmark" style={{ color: primitiveTokens['neutral/50'] }}>
        HireQuick
      </Text>
    </Box>
  );
}
