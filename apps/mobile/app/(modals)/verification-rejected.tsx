/**
 * Verification rejected — matches Figma `State / Error – Verification rejected`
 * (56:114): a danger EmptyState with the rejection reason and Resubmit ID /
 * Contact support actions. Shown when an usher's ID check fails.
 */
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box } from '../../theme/restyle.js';
import { EmptyState } from '../../components/EmptyState.js';

export default function VerificationRejected(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <Box flex={1} backgroundColor="bgCanvas" alignItems="center" justifyContent="center" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <EmptyState
        icon="lock"
        tone="danger"
        title="We couldn’t verify your ID"
        subtitle="The photo was unclear or didn’t match your details. Please resubmit a clear photo of a valid government ID."
        reason="Reason: document photo was blurry"
        actionLabel="Resubmit ID"
        onAction={() => router.replace('/(modals)/id-verification')}
        secondaryLabel="Contact support"
        onSecondary={() => router.back()}
      />
    </Box>
  );
}
