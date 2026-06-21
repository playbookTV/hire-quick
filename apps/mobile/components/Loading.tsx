/** Full-screen centered spinner on the canvas. */
import { ActivityIndicator } from 'react-native';
import { useTheme, Box } from '../theme/restyle.js';

export function Loading(): React.JSX.Element {
  const theme = useTheme();
  return (
    <Box flex={1} alignItems="center" justifyContent="center" backgroundColor="bgCanvas">
      <ActivityIndicator color={theme.colors.brandEmerald} size="large" />
    </Box>
  );
}
