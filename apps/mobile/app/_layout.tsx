/**
 * Root layout: provider stack + font/splash gate. Order matters — gesture root →
 * safe-area → Restyle theme (light/dark by system) → React Query → Auth → router.
 */
import { useEffect } from 'react';
import { AppState, Platform, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@shopify/restyle';
import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

import theme, { darkTheme } from '../theme/theme.js';
import { useAppFonts } from '../theme/fonts.js';
import { queryClient } from '../lib/query.js';
import { AuthProvider } from '../lib/auth-context.js';
import { ToastProvider } from '../lib/toast.js';
import { withMonitoring } from '../lib/monitoring.js';

// expo-router renders this for any uncaught render error below the root, instead
// of crashing the whole app. Named export must be `ErrorBoundary`.
export { ErrorScreen as ErrorBoundary } from '../components/ErrorScreen.js';

void SplashScreen.preventAutoHideAsync();

function RootLayout(): React.JSX.Element | null {
  const scheme = useColorScheme();
  const [fontsLoaded, fontError] = useAppFonts();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    focusManager.setFocused(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => {
      focusManager.setFocused(state === 'active');
    });
    return () => subscription.remove();
  }, []);

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
              <ToastProvider>
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
              </ToastProvider>
            </AuthProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default withMonitoring(RootLayout);
