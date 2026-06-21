/**
 * Confirm & pay — matches Figma `Client / 17 Payment Summary` (34:391): the
 * booking line items, a totals card (subtotal / staff-paid fee / You pay), an
 * escrow Banner, the payment method ListItem, and a "Pay" CTA. Static preview
 * until the confirm→Paystack flow is wired (a later phase).
 */
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Text } from '../../theme/restyle.js';
import { AppBar } from '../../components/AppBar.js';
import { Screen } from '../../components/Screen.js';
import { Avatar } from '../../components/Avatar.js';
import { Banner } from '../../components/Banner.js';
import { ListItem } from '../../components/ListItem.js';
import { Button } from '../../components/Button.js';

const STAFF = [
  { name: 'Ada Martins', price: '₦15,000' },
  { name: 'Bisi Okoro', price: '₦15,000' },
];

export default function PaymentSummary(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Confirm & pay" showBack inset />
      <Screen scroll>
        <Box style={{ gap: 16 }}>
          {/* line items */}
          <Box backgroundColor="bgSurface" borderWidth={1} borderColor="borderDefault" borderRadius="lg" padding="400" style={{ gap: 12 }}>
            <Text variant="titleM">Booking {STAFF.length} ushers</Text>
            {STAFF.map((s) => (
              <Box key={s.name} flexDirection="row" alignItems="center" style={{ gap: 12 }}>
                <Avatar name={s.name} size={32} />
                <Text variant="bodyLg" color="inkDefault" style={{ flex: 1 }}>
                  {s.name}
                </Text>
                <Text variant="label" style={{ fontSize: 15 }} color="inkStrong">
                  {s.price}
                </Text>
              </Box>
            ))}
          </Box>

          {/* totals */}
          <Box backgroundColor="bgSurface" borderWidth={1} borderColor="borderDefault" borderRadius="lg" padding="400" style={{ gap: 12 }}>
            <Box flexDirection="row" alignItems="center" justifyContent="space-between">
              <Text variant="body" color="inkMuted">
                Subtotal · 2 × ₦15,000
              </Text>
              <Text variant="label" style={{ fontSize: 15 }} color="inkStrong">
                ₦30,000
              </Text>
            </Box>
            <Box flexDirection="row" alignItems="center" justifyContent="space-between">
              <Text variant="body" color="inkMuted">
                Platform fee (15%)
              </Text>
              <Text variant="label" style={{ fontSize: 15 }} color="inkStrong">
                Paid by staff
              </Text>
            </Box>
            <Box style={{ width: 100, height: 1 }} backgroundColor="borderDefault" />
            <Box flexDirection="row" alignItems="center" justifyContent="space-between">
              <Text variant="titleM">You pay</Text>
              <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 22, lineHeight: 28, letterSpacing: -0.3 }} color="brandEmerald">
                ₦30,000
              </Text>
            </Box>
            <Text variant="bodySm" color="inkMuted">
              The 15% fee is deducted from each usher’s payout — your total is exactly ₦30,000.
            </Text>
          </Box>

          <Banner tone="brand" message="Held in escrow — released to each usher only when they check in." />

          <ListItem icon="credit-card" title="Paystack" subtitle="Card ending 4321" actionLabel="Change" />
        </Box>

        <Box style={{ flex: 1, minHeight: 24 }} />
        <Box style={{ gap: 8, paddingBottom: insets.bottom }}>
          <Button label="Pay ₦30,000" onPress={() => router.replace('/(modals)/funds-held')} />
          <Text variant="bodySm" color="inkFaint" style={{ textAlign: 'center' }}>
            Secured by Paystack
          </Text>
        </Box>
      </Screen>
    </Box>
  );
}
