/**
 * Usher Dashboard — matches Figma `Usher / 01 Dashboard` (43:2): greeting, an
 * emerald "available to withdraw" card (Display/XL figure), and Upcoming jobs.
 * A verification banner shows until the usher is VERIFIED (the API gate).
 * Earnings/jobs are stubbed until the usher APIs land.
 */
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { SectionHeader } from '../../components/SectionHeader.js';
import { Banner } from '../../components/Banner.js';
import { Button } from '../../components/Button.js';
import { Icon } from '../../components/Icon.js';
import { shadowMd, shadowSm } from '../../theme/shadows.js';
import { primitives } from '../../theme/primitives.js';
import { useAuth } from '../../lib/auth-context.js';

const JOBS = [
  { title: 'Adeola’s Wedding', when: 'Sat 12 Jul · 4:00 PM', earn: '₦15,000', status: 'Confirmed' as const },
  { title: 'Corporate Gala', when: 'Fri 18 Jul · 6:00 PM', earn: '₦16,000', status: 'Applied' as const },
];

function JobRow({ title, when, earn, status }: { title: string; when: string; earn: string; status: 'Confirmed' | 'Applied' }) {
  const theme = useTheme();
  const confirmed = status === 'Confirmed';
  return (
    <Box backgroundColor="bgSurface" borderWidth={1} borderColor="borderDefault" borderRadius="lg" padding="400" style={[{ gap: 8 }, shadowSm]}>
      <Box flexDirection="row" alignItems="center" justifyContent="space-between">
        <Text variant="titleM">{title}</Text>
        <Box style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: theme.borderRadii.pill, backgroundColor: confirmed ? theme.colors.statusSuccessTint : theme.colors.accentGoldTint }}>
          <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, lineHeight: 16, letterSpacing: 0.2 }} color={confirmed ? 'statusSuccess' : 'accentGoldStrong'}>
            {status}
          </Text>
        </Box>
      </Box>
      <Box flexDirection="row" alignItems="center" style={{ gap: 8 }}>
        <Icon name="calendar" size={16} color="inkMuted" />
        <Text variant="bodySm" color="inkMuted">
          {when}
        </Text>
      </Box>
      <Box flexDirection="row" alignItems="baseline" style={{ gap: 4 }}>
        <Text variant="bodySm" color="inkMuted">You’ll earn</Text>
        <Text variant="amountM" color="brandEmerald">{earn}</Text>
      </Box>
    </Box>
  );
}

export default function UsherHome(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const verified = user?.usher?.verificationStatus === 'VERIFIED';

  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 20 }} showsVerticalScrollIndicator={false}>
        {/* greeting */}
        <Box flexDirection="row" alignItems="center" justifyContent="space-between">
          <Box style={{ gap: 2 }}>
            <Text variant="overline" color="accentGoldStrong" style={{ letterSpacing: 1.2 }}>
              GOOD MORNING
            </Text>
            <Text variant="h2">Hi there</Text>
          </Box>
          <Box style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandEmeraldTint }}>
            <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: theme.colors.brandEmerald }}>U</Text>
          </Box>
        </Box>

        {!verified ? (
          <Box style={{ gap: 12 }}>
            <Banner tone="brand" title="Verify your identity" message="Submit your ID and a selfie to unlock job applications and payouts." />
            <Button label="Start verification" variant="secondary" onPress={() => router.push('/(modals)/profile-setup')} />
          </Box>
        ) : null}

        {/* earnings */}
        <Box borderRadius="lg" style={[{ backgroundColor: theme.colors.brandEmerald, padding: 20, gap: 12 }, shadowMd]}>
          <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, lineHeight: 14, letterSpacing: 1.2, color: primitives.gold[500] }}>
            AVAILABLE TO WITHDRAW
          </Text>
          <Text style={{ fontFamily: 'Fraunces_900Black', fontSize: 32, lineHeight: 38, letterSpacing: -1, color: '#FBF7F0' }}>₦48,000</Text>
          <Box flexDirection="row" alignItems="center" justifyContent="space-between">
            <Box flexDirection="row" alignItems="center" style={{ gap: 4 }}>
              <Icon name="clock" size={16} color="inverseInk" />
              <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, lineHeight: 18, color: primitives.emerald[100] }}>
                ₦30,000 pending in escrow
              </Text>
            </Box>
            <Box backgroundColor="bgSurface" borderRadius="pill" style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text variant="label" style={{ fontSize: 13 }} color="brandEmerald" onPress={() => router.push('/(usher)/wallet')}>
                Withdraw
              </Text>
            </Box>
          </Box>
        </Box>

        <Box>
          <SectionHeader title="Upcoming jobs" actionLabel="See all" onAction={() => router.push('/(usher)/calendar')} />
          <Box style={{ gap: 12 }}>
            {JOBS.map((j) => (
              <JobRow key={j.title} {...j} />
            ))}
          </Box>
        </Box>
      </ScrollView>
    </Box>
  );
}
