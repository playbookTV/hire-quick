import { useRef, useState, type ComponentType } from 'react';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Button } from '../../components/Button.js';
import { Banner } from '../../components/Banner.js';
import { Input } from '../../components/Input.js';
import { StepIndicator } from '../../components/StepIndicator.js';
import { ApiError, userMessage } from '../../lib/api-error.js';
import {
  startKyc,
  type KycIdentity,
  type KycSession,
  type SmileCaptureProps,
} from '../../lib/kyc.js';

// Load native modules only after entry; Expo Go and web can still open the explainer.
export default function IdVerification(): React.JSX.Element {
  const [SmileCapture, setSmileCapture] = useState<ComponentType<SmileCaptureProps> | null>(null);
  const router = useRouter();
  const qc = useQueryClient();
  const lock = useRef(false);
  const [identity, setIdentity] = useState<KycIdentity>({
    idType: 'NIN',
    idNumber: '',
    givenNames: '',
    lastName: '',
  });
  const [session, setSession] = useState<KycSession | null>(null);
  const [reference, setReference] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported =
    Platform.OS !== 'web' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
  const valid =
    /^\d{11}$/.test(identity.idNumber) &&
    !!identity.givenNames.trim() &&
    !!identity.lastName.trim() &&
    (!identity.email?.trim() || z.string().email().safeParse(identity.email.trim()).success);
  async function start() {
    if (lock.current || !valid || !supported) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      // Import before reserving a paid attempt, so missing native modules cannot consume one.
      const captureModule = await import('../../components/SmileCapture.js');
      setSmileCapture(() => captureModule.default);
      const next = await startKyc(identity, reference);
      setReference(next.referenceId);
      setSession(next);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? userMessage(e)
          : 'Identity capture couldn’t load. Install the latest HireQuick build and try again.',
      );
      setReference(undefined);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (session && SmileCapture)
    return (
      <SmileCapture
        session={session}
        identity={identity}
        onSubmitted={() => {
          // Approval is read back from HireQuick after the server verifies Smile's result.
          void qc.invalidateQueries({ queryKey: ['verification'] });
          router.replace('/(verification)/awaiting-approval');
          setSession(null);
          setIdentity({ idType: 'NIN', idNumber: '', givenNames: '', lastName: '' });
        }}
        onCancelled={() => {
          setSession(null);
          setError('Identity check paused. Continue when you’re ready.');
        }}
        onFailure={() => {
          setSession(null);
          setError(
            'We couldn’t finish the capture. Check your camera permission and connection, then try again.',
          );
        }}
      />
    );
  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Verify your identity" showBack inset />
      <Screen scroll>
        <Box style={{ gap: 16 }}>
          <StepIndicator total={5} current={3} label="STEP 4 OF 5 · VERIFICATION" />
          <Text variant="h2">Let’s confirm it’s you</Text>
          <Text variant="body" color="inkMuted">
            Smile ID checks your Nigerian ID and a live selfie. Use the names on your ID, then
            follow the camera instructions.
          </Text>
          {!supported && (
            <Banner
              tone="info"
              message="For secure camera verification, open the installed HireQuick app on your phone."
            />
          )}
          <Text variant="label">Given names</Text>
          <Input
            accessibilityLabel="Given names on your ID"
            value={identity.givenNames}
            editable={!busy}
            maxLength={100}
            autoCapitalize="words"
            autoCorrect={false}
            onChangeText={(givenNames) => setIdentity((v) => ({ ...v, givenNames }))}
          />
          <Text variant="label">Surname</Text>
          <Input
            accessibilityLabel="Surname on your ID"
            value={identity.lastName}
            editable={!busy}
            maxLength={100}
            autoCapitalize="words"
            autoCorrect={false}
            onChangeText={(lastName) => setIdentity((v) => ({ ...v, lastName }))}
          />
          <Text variant="label">Email (optional)</Text>
          <Input
            accessibilityLabel="Email for identity verification"
            value={identity.email ?? ''}
            editable={!busy}
            maxLength={254}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(email) => setIdentity((v) => ({ ...v, email }))}
          />
          <Text variant="label">Choose your ID</Text>
          <Box flexDirection="row" style={{ gap: 12 }}>
            {(['NIN', 'BVN'] as const).map((idType) => (
              <Button
                key={idType}
                label={idType}
                selected={identity.idType === idType}
                variant={identity.idType === idType ? 'primary' : 'ghost'}
                disabled={busy}
                onPress={() => setIdentity((v) => ({ ...v, idType, idNumber: '' }))}
              />
            ))}
          </Box>
          <Input
            accessibilityLabel={`${identity.idType} number`}
            placeholder={`11-digit ${identity.idType}`}
            keyboardType="number-pad"
            maxLength={11}
            value={identity.idNumber}
            editable={!busy}
            autoCorrect={false}
            onChangeText={(idNumber) =>
              setIdentity((v) => ({ ...v, idNumber: idNumber.replace(/\D/g, '') }))
            }
          />
          <Text variant="bodySm" color="inkMuted">
            Your details are sent securely to Smile ID for verification. HireQuick keeps the result,
            not your ID number or biometric images. You’ll review biometric consent before taking
            your selfie.
          </Text>
          <Button
            variant="ghost"
            label="Read our privacy policy"
            onPress={() => router.push('/privacy-policy')}
          />
          {error && <Banner tone="info" message={error} />}
          <Button
            label={busy ? 'Connecting…' : 'Continue with Smile ID'}
            onPress={() => void start()}
            disabled={!valid || busy || !supported}
          />
          <Button
            variant="ghost"
            label="Check verification status"
            onPress={() => router.push('/(verification)/awaiting-approval')}
          />
        </Box>
      </Screen>
    </Box>
  );
}
