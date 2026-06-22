/**
 * ID Verification — matches Figma `Usher / 08 ID Verification` (52:252): a step
 * indicator, an explainer, two upload tiles (ID + selfie), a privacy note, and a
 * "Submit for review" action that leads to the awaiting-approval state. (TRD §
 * verification gate — ushers must verify before applying.)
 */
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Button } from '../../components/Button.js';
import { AddPhoto } from '../../components/AddPhoto.js';
import { StepIndicator } from '../../components/StepIndicator.js';
import { Icon } from '../../components/Icon.js';

export default function IdVerification(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Verify your identity" showBack inset />
      <Screen scroll>
        <Box style={{ gap: 16 }}>
          <StepIndicator total={5} current={3} label="STEP 4 OF 5 · VERIFICATION" />
          <Text variant="body" color="inkMuted">
            We verify every usher so clients can trust who they hire. This is required before you can apply.
          </Text>
          <AddPhoto variant="upload" icon="camera" title="Upload your ID" subtitle="NIN, driver’s license or passport" onPress={() => { /* pick ID */ }} />
          <AddPhoto variant="upload" icon="camera" title="Take a selfie" subtitle="Hold your ID next to your face" onPress={() => { /* capture selfie */ }} />
          <Box flexDirection="row" alignItems="center" style={{ gap: 8 }}>
            <Icon name="lock" size={16} color="inkMuted" />
            <Text variant="bodySm" color="inkMuted" style={{ flex: 1 }}>
              Encrypted, only used for verification, and deleted after approval.
            </Text>
          </Box>
        </Box>
      </Screen>

      {/* action */}
      <Box backgroundColor="bgCanvas" style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 16, borderTopWidth: 1.5, borderTopColor: theme.colors.borderDefault }}>
        <Button label="Submit for review" onPress={() => router.replace('/(modals)/awaiting-approval')} />
      </Box>
    </Box>
  );
}
