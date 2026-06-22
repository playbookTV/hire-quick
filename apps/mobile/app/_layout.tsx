/**
 * Root layout: provider stack + font/splash gate. Order matters — gesture root →
 * safe-area → Restyle theme (light/dark by system) → React Query → Auth → router.
 */
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@shopify/restyle';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

import theme, { darkTheme } from '../theme/theme.js';
import { useAppFonts } from '../theme/fonts.js';
import { queryClient } from '../lib/query.js';
import { AuthProvider } from '../lib/auth-context.js';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout(): React.JSX.Element | null {
  const scheme = useColorScheme();
  const [fontsLoaded, fontError] = useAppFonts();

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  const activeTheme = scheme === 'dark' ? darkTheme : theme;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider theme={activeTheme}>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(client)" />
                <Stack.Screen name="(usher)" />
                {/* Verification is a first-class card flow (gestures off in its layout), not a modal. */}
                <Stack.Screen name="(verification)" />
                <Stack.Screen name="(modals)" options={{ presentation: 'modal' }} />
              </Stack>
            </AuthProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
