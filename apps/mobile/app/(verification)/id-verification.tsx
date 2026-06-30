/**
 * ID Verification — matches Figma `Usher / 08 ID Verification` (52:252): a step
 * indicator, an explainer, two upload tiles (ID + selfie), a privacy note, and a
 * "Submit for review" action that leads to the awaiting-approval state. (TRD §
 * verification gate — ushers must verify before applying.)
 *
 * Documents upload via server-issued presigned URLs (lib/upload): the bytes go
 * straight to object storage and we submit the returned server-owned keys.
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Button } from '../../components/Button.js';
import { AddPhoto } from '../../components/AddPhoto.js';
import { StepIndicator } from '../../components/StepIndicator.js';
import { Icon } from '../../components/Icon.js';
import { useSubmitVerification } from '../../lib/hooks.js';
import { uploadVerificationDoc, type DocKind } from '../../lib/upload.js';

function tileSubtitle(isUploading: boolean, hasDoc: boolean, doneText: string, idleText: string): string {
  if (isUploading) return 'Uploading…';
  if (hasDoc) return doneText;
  return idleText;
}

export default function IdVerification(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const submit = useSubmitVerification();
  const [keys, setKeys] = useState<{ id?: string; selfie?: string }>({});
  const [uploading, setUploading] = useState<DocKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pickAndUpload = async (kind: DocKind, source: 'library' | 'camera'): Promise<void> => {
    if (uploading) return;
    setError(null);
    try {
      const perm =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError(
          source === 'camera'
            ? 'Camera access is off. Allow camera access in Settings to take your selfie.'
            : 'Photo access is off. Allow photo access in Settings to upload your ID.',
        );
        return;
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      const asset = result.canceled ? undefined : result.assets[0];
      if (!asset) return;

      setUploading(kind);
      const key = await uploadVerificationDoc(kind, {
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
      });
      setKeys((k) => ({ ...k, [kind]: key }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(null);
    }
  };

  const onSubmit = (): void => {
    if (!keys.id || !keys.selfie) return;
    setError(null);
    submit.mutate(
      { idDocumentUrl: keys.id, selfieUrl: keys.selfie },
      {
        onSuccess: () => router.replace('/(verification)/awaiting-approval'),
        onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Couldn’t submit your documents. Please try again.'),
      },
    );
  };

  const idSubtitle = tileSubtitle(uploading === 'id', !!keys.id, 'ID added', 'NIN, driver’s license or passport');
  const selfieSubtitle = tileSubtitle(uploading === 'selfie', !!keys.selfie, 'Selfie added', 'Hold your ID next to your face');

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Verify your identity" showBack inset />
      <Screen scroll>
        <Box style={{ gap: 16 }}>
          <StepIndicator total={5} current={3} label="STEP 4 OF 5 · VERIFICATION" />
          <Text variant="body" color="inkMuted">
            We verify every usher so clients can trust who they hire. This is required before you can apply.
          </Text>
          <AddPhoto
            variant="upload"
            icon={keys.id ? 'check' : 'camera'}
            title="Upload your ID"
            subtitle={idSubtitle}
            onPress={() => void pickAndUpload('id', 'library')}
          />
          <AddPhoto
            variant="upload"
            icon={keys.selfie ? 'check' : 'camera'}
            title="Take a selfie"
            subtitle={selfieSubtitle}
            onPress={() => void pickAndUpload('selfie', 'camera')}
          />
          <Box flexDirection="row" alignItems="center" style={{ gap: 8 }}>
            <Icon name="lock" size={16} color="inkMuted" />
            <Text variant="bodySm" color="inkMuted" style={{ flex: 1 }}>
              Encrypted, only used for verification, and deleted after approval.
            </Text>
          </Box>
        </Box>
      </Screen>

      {/* action */}
      <Box backgroundColor="bgCanvas" style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 16, borderTopWidth: 1.5, borderTopColor: theme.colors.borderDefault, gap: 10 }}>
        {error ? (
          <Box flexDirection="row" alignItems="center" backgroundColor="statusDangerTint" borderRadius="md" padding="300" style={{ gap: 8 }}>
            <Icon name="alert-circle" size={16} color="statusDanger" />
            <Text variant="bodySm" color="statusDanger" style={{ flex: 1 }}>{error}</Text>
          </Box>
        ) : null}
        <Button
          label={submit.isPending ? 'Submitting…' : 'Submit for review'}
          onPress={onSubmit}
          disabled={submit.isPending || uploading !== null || !keys.id || !keys.selfie}
        />
      </Box>
    </Box>
  );
}
