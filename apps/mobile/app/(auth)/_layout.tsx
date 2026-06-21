import { Stack } from 'expo-router';

export default function AuthLayout(): React.JSX.Element {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
