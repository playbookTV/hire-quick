import { Link, Stack } from 'expo-router';
import { Screen } from '../components/Screen.js';
import { Box, Text } from '../theme/restyle.js';

export default function NotFound(): React.JSX.Element {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <Screen topInset>
        <Box flex={1} alignItems="center" justifyContent="center" gap="300">
          <Text variant="h2">This screen doesn’t exist.</Text>
          <Link href="/">
            <Text variant="label" color="brandEmerald">
              Go home
            </Text>
          </Link>
        </Box>
      </Screen>
    </>
  );
}
