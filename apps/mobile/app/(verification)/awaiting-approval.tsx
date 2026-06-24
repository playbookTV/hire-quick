/**
 * Awaiting Approval — matches Figma `Usher / 09 Awaiting Approval` (53:270): a
 * gold status badge, a "verification in review" message, a Submitted → Under
 * review → Approved progress list, and a ghost CTA to browse jobs meanwhile.
 */
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { Button } from '../../components/Button.js';
import { IconCircle } from '../../components/IconCircle.js';
import { Icon } from '../../components/Icon.js';
import { StepIndicator } from '../../components/StepIndicator.js';
import { useMyVerifications } from '../../lib/hooks.js';

type StepState = 'done' | 'active' | 'todo';

function StatusStep({ state, title, subtitle }: { state: StepState; title: string; subtitle: string }) {
  const theme = useTheme();
  const dot =
    state === 'done' ? (
      <Box style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.statusSuccess }}>
        <Icon name="check" size={15} color="inverseInk" />
      </Box>
    ) : state === 'active' ? (
      <Box style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.accentGoldStrong }}>
        <Box style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.inverseInk }} />
      </Box>
    ) : (
      <Box style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.bgSurface }} />
    );
  return (
    <Box flexDirection="row" alignItems="center" style={{ gap: 12 }}>
      {dot}
      <Box flex={1}>
        <Text variant="label" style={{ fontSize: 15, lineHeight: 20 }} color={state === 'todo' ? 'inkMuted' : 'inkStrong'}>
          {title}
        </Text>
        <Text variant="bodySm" color="inkFaint">
          {subtitle}
        </Text>
      </Box>
    </Box>
  );
}

export default function AwaitingApproval(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const verifications = useMyVerifications();
  const latest = verifications.data?.[0];

  // A rejected submission routes to the dedicated rejected state.
  useEffect(() => {
    if (latest?.status === 'REJECTED') router.replace('/(verification)/verification-rejected');
  }, [latest?.status, router]);

  const approved = latest?.status === 'APPROVED';

  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      <Box style={{ paddingHorizontal: 24, paddingTop: 8 }}>
        <StepIndicator total={5} current={4} label={approved ? 'STEP 5 OF 5 · APPROVED' : 'STEP 5 OF 5 · REVIEW'} />
      </Box>
      <Box flex={1} alignItems="center" justifyContent="center" style={{ paddingHorizontal: 24, gap: 20 }}>
        <IconCircle icon={approved ? 'check' : 'clock'} tone={approved ? 'success' : 'gold'} size={96} iconColor={approved ? 'statusSuccess' : 'accentGoldStrong'} />
        <Text variant="h1" style={{ textAlign: 'center' }}>{approved ? 'You’re verified' : 'Verification in review'}</Text>
        <Text variant="body" color="inkMuted" style={{ textAlign: 'center' }}>
          {approved
            ? 'You can now apply to jobs and get paid into your wallet.'
            : 'We’re checking your ID — usually within 24 hours. We’ll notify you the moment you’re approved.'}
        </Text>
        <Box backgroundColor="bgSurface" borderWidth={1} borderColor="borderDefault" borderRadius="lg" padding="400" style={{ gap: 12, width: '100%' }}>
          <StatusStep state="done" title="Submitted" subtitle="Documents received" />
          <StatusStep state={approved ? 'done' : 'active'} title="Under review" subtitle="Our team is checking" />
          <StatusStep state={approved ? 'done' : 'todo'} title="Approved" subtitle="You can start applying" />
        </Box>
      </Box>
      <Box backgroundColor="bgSurface" style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 16 }}>
        <Button
          label={approved ? 'Start applying' : 'Browse jobs while you wait'}
          variant={approved ? 'primary' : 'ghost'}
          onPress={() => router.replace('/(usher)/jobs')}
        />
      </Box>
    </Box>
  );
}
