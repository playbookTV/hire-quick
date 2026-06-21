/**
 * Payment failed — matches Figma `State / Error – Payment failed` (56:85): a
 * danger EmptyState reassuring the client no money left their account, with Try
 * again / Change payment method actions. Shown when a Paystack charge fails.
 */
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box } from '../../theme/restyle.js';
import { EmptyState } from '../../components/EmptyState.js';

export default function PaymentFailed(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <Box flex={1} backgroundColor="bgCanvas" alignItems="center" justifyContent="center" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <EmptyState
        icon="credit-card"
        tone="danger"
        title="Payment didn’t go through"
        subtitle="We couldn’t process your payment, so your staff aren’t confirmed yet — no money has left your account."
        actionLabel="Try again"
        onAction={() => router.back()}
        secondaryLabel="Change payment method"
        onSecondary={() => router.back()}
      />
    </Box>
  );
}
