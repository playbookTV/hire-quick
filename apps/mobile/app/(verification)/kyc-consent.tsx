/**
 * Biometric KYC consent + start (Dojah). The usher consents to NIN/BVN + a
 * liveness selfie, we ask the API for a Dojah widget id + reference id, then the
 * device launches the Dojah KYC widget. The widget's onClose is NOT trusted — the
 * server reconciles the real result from Dojah's `kyc.widget` webhook, so after
 * the widget closes we simply head to the awaiting-approval screen, which polls.
 *
 * NATIVE WIDGET (pending Dojah account + EAS build): install
 * `dojah-kyc-sdk-react_native` + the `dojah-kyc-sdk-react-expo` config plugin, then
 * launch it here with { widgetId, referenceId } (see `launchDojahWidget` below).
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Button } from '../../components/Button.js';
import { Banner } from '../../components/Banner.js';
import { Box, Text } from '../../theme/restyle.js';
import { Icon } from '../../components/Icon.js';
import { useKycStart } from '../../lib/hooks.js';
import { useToast } from '../../lib/toast.js';
import { userMessage } from '../../lib/api-error.js';

const POINTS = [
  { icon: 'credit-card' as const, text: 'Your NIN or BVN, checked against the government record.' },
  { icon: 'camera' as const, text: 'A quick selfie to confirm you’re a real, live person.' },
  { icon: 'shield' as const, text: 'Used only to verify your identity — never shared with clients.' },
];

export default function KycConsent(): React.JSX.Element {
  const router = useRouter();
  const start = useKycStart();
  const toast = useToast();
  const [agreed, setAgreed] = useState(false);

  const begin = (): void => {
    start.mutate(undefined, {
      onSuccess: (session) => {
        // NATIVE: launchDojahWidget(session.widgetId, session.referenceId) then,
        // on close, route to awaiting-approval. Until the SDK is wired, go straight
        // there — the server is authoritative via the Dojah webhook.
        void session;
        router.replace('/(verification)/awaiting-approval');
      },
      onError: (e: unknown) => toast.error(userMessage(e), 'Couldn’t start verification'),
    });
  };

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Verify your identity" showBack inset />
      <Screen scroll>
        <Text variant="h1" marginBottom="200">
          Confirm it’s really you
        </Text>
        <Text variant="body" color="inkMuted" marginBottom="500">
          A one-time check keeps the platform safe and unlocks paid jobs. It takes about a minute.
        </Text>

        <Box style={{ gap: 16 }} marginBottom="500">
          {POINTS.map((p) => (
            <Box key={p.icon} flexDirection="row" alignItems="center" style={{ gap: 12 }}>
              <Icon name={p.icon} size={20} color="brandEmerald" />
              <Text variant="body" style={{ flex: 1 }}>
                {p.text}
              </Text>
            </Box>
          ))}
        </Box>

        <Box marginBottom="500">
          <Banner tone="info" message="By continuing, you consent to HireQuick verifying your NIN/BVN with our verification partner (Dojah)." />
        </Box>

        <Box flexDirection="row" alignItems="center" style={{ gap: 12 }} marginBottom="600">
          <Button
            label={agreed ? '☑  I consent' : '☐  I consent'}
            variant="secondary"
            onPress={() => setAgreed((v) => !v)}
          />
        </Box>

        <Button label="Start verification" onPress={begin} disabled={!agreed || start.isPending} loading={start.isPending} />
      </Screen>
    </Box>
  );
}
