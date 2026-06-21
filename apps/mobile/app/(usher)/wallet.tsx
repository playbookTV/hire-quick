/**
 * Wallet — matches Figma `Usher / 05 Wallet` (44:44): an emerald balance card
 * (Display/2XL figure + Withdraw), pending/lifetime stat cards, and a Recent
 * activity list of ActivityRows. Stub data until the wallet API is wired.
 */
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { SectionHeader } from '../../components/SectionHeader.js';
import { ActivityRow, type ActivityType } from '../../components/ActivityRow.js';
import { Button } from '../../components/Button.js';
import { shadowMd } from '../../theme/shadows.js';
import { primitives } from '../../theme/primitives.js';

const ACTIVITY: { type: ActivityType; title: string; subtitle: string; amount: string }[] = [
  { type: 'credit', title: 'Payout received', subtitle: 'Adeola’s Wedding', amount: '+₦15,000' },
  { type: 'debit', title: 'Withdrawal', subtitle: 'GTBank ••4321', amount: '−₦40,000' },
  { type: 'pending', title: 'Escrow hold', subtitle: 'Corporate Gala', amount: '₦16,000' },
];

function StatCard({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <Box flex={1} backgroundColor="bgSurface" borderWidth={1} borderColor="borderDefault" borderRadius="md" padding="400" style={{ gap: 4 }}>
      <Text variant="bodySm" color="inkMuted">
        {label}
      </Text>
      <Text variant="amountM" color={gold ? 'accentGoldStrong' : 'inkStrong'}>
        {value}
      </Text>
    </Box>
  );
}

export default function Wallet(): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 16 }} showsVerticalScrollIndicator={false}>
        <Text variant="h2">Wallet</Text>

        {/* balance */}
        <Box borderRadius="lg" style={[{ backgroundColor: theme.colors.brandEmerald, padding: 20, gap: 12 }, shadowMd]}>
          <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, lineHeight: 14, letterSpacing: 1.2, color: primitives.gold[500] }}>
            AVAILABLE TO WITHDRAW
          </Text>
          <Text style={{ fontFamily: 'Fraunces_900Black', fontSize: 40, lineHeight: 44, letterSpacing: -1.5, color: '#FBF7F0' }}>₦48,000</Text>
          <Button label="Withdraw to bank" variant="secondary" onPress={() => { /* withdraw flow */ }} />
        </Box>

        {/* stats */}
        <Box flexDirection="row" style={{ gap: 12 }}>
          <StatCard label="Pending in escrow" value="₦30,000" gold />
          <StatCard label="Lifetime earned" value="₦312,000" />
        </Box>

        <SectionHeader title="Recent activity" />
        <Box style={{ gap: 8 }}>
          {ACTIVITY.map((a) => (
            <ActivityRow key={a.title} type={a.type} title={a.title} subtitle={a.subtitle} amount={a.amount} />
          ))}
        </Box>
      </ScrollView>
    </Box>
  );
}
