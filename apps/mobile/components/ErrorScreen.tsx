/**
 * App-wide crash fallback, wired as expo-router's ErrorBoundary from the root
 * _layout. A render exception used to take the whole app down ("it keeps
 * shutting down"); this catches it and offers a retry. Deliberately built from
 * plain RN primitives with hardcoded colours so it renders even when the failure
 * is in a provider above the theme.
 */
import { View, Text, Pressable } from 'react-native';
import { useEffect } from 'react';
import type { ErrorBoundaryProps } from 'expo-router';
import { reportRenderError } from '../lib/monitoring.js';

export function ErrorScreen({ error, retry }: Readonly<ErrorBoundaryProps>): React.JSX.Element {
  useEffect(() => { reportRenderError(error); }, [error]);
  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', color: '#11150F', textAlign: 'center' }}>Something went wrong</Text>
      <Text style={{ fontSize: 15, lineHeight: 22, color: '#5C564C', textAlign: 'center' }}>This screen hit a snag. Your data is safe — try again.</Text>
      <Pressable
        onPress={() => {
          void retry();
        }}
        accessibilityRole="button"
        accessibilityLabel="Try again"
        style={{ marginTop: 8, backgroundColor: '#0E7C5A', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600' }}>Try again</Text>
      </Pressable>
      {__DEV__ ? <Text style={{ marginTop: 12, fontSize: 12, color: '#928979', textAlign: 'center' }}>{error.message}</Text> : null}
    </View>
  );
}
