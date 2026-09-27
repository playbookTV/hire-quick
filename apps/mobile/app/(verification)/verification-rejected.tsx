/**
 * Verification rejected — matches Figma `State / Error – Verification rejected`
 * (56:114): a danger EmptyState with the rejection reason and Resubmit ID /
 * Contact support actions. Shown when an usher's ID check fails.
 */
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box } from '../../theme/restyle.js';
import { EmptyState } from '../../components/EmptyState.js';
import { useMyVerifications } from '../../lib/hooks.js';
import { openSupport } from '../../lib/support.js';

export default function VerificationRejected(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const verifications = useMyVerifications();
  const reason = verifications.data?.find((v) => v.status === 'REJECTED')?.reason;
  const reasonSuffix = reason ? ` (reason: ${reason})` : '';

  return (
    <Box
      flex={1}
      backgroundColor="bgCanvas"
      alignItems="center"
      justifyContent="center"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <EmptyState
        icon="lock"
        tone="danger"
        title="We couldn’t verify your ID"
        subtitle="Your identity check didn’t pass. Confirm the names and number on your ID, then try again with Smile ID. Contact support if you need help."
        reason={reason ? `Reason: ${reason}` : undefined}
        actionLabel="Try verification again"
        onAction={() => router.replace('/(verification)/id-verification')}
        secondaryLabel="Contact support"
        onSecondary={() => {
          void openSupport(
            `Hi HireQuick support, my ID verification was rejected${reasonSuffix} and I need help.`,
          );
        }}
      />
    </Box>
  );
}
