/**
 * Awaiting Approval — matches Figma `Usher / 09 Awaiting Approval` (53:270): a
 * gold status badge, a "verification in review" message, a Submitted → Under
 * review → Approved progress list, and a ghost CTA to browse jobs meanwhile.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { Banner } from '../../components/Banner.js';
import { Button } from '../../components/Button.js';
import { IconCircle } from '../../components/IconCircle.js';
import { Icon } from '../../components/Icon.js';
import { QueryState } from '../../components/QueryState.js';
import { EmptyState } from '../../components/EmptyState.js';
import { Screen } from '../../components/Screen.js';
import { StepIndicator } from '../../components/StepIndicator.js';
import { useAuth } from '../../lib/auth-context.js';
import { openSupport } from '../../lib/support.js';
import { useMyVerifications } from '../../lib/hooks.js';

type StepState = 'done' | 'active' | 'todo';

function StatusStep({
  state,
  title,
  subtitle,
}: {
  state: StepState;
  title: string;
  subtitle: string;
}) {
  const theme = useTheme();
  const dot =
    state === 'done' ? (
      <Box
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.statusSuccessTint,
        }}
      >
        <Icon name="check" size={15} color="statusSuccess" />
      </Box>
    ) : state === 'active' ? (
      <Box
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.accentGoldTint,
        }}
      >
        <Box
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: theme.colors.accentGoldStrong,
          }}
        />
      </Box>
    ) : (
      <Box
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          borderWidth: 1.5,
          borderColor: theme.colors.borderStrong,
          backgroundColor: theme.colors.bgSurface,
        }}
      />
    );
  return (
    <Box flexDirection="row" alignItems="center" style={{ gap: 12 }}>
      {dot}
      <Box flex={1}>
        <Text
          variant="label"
          style={{ fontSize: 15, lineHeight: 20 }}
          color={state === 'todo' ? 'inkMuted' : 'inkStrong'}
        >
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
  const { user, refreshMe } = useAuth();
  const latest = verifications.data?.[0];

  // A rejected submission routes to the dedicated rejected state.
  useEffect(() => {
    if (latest?.status === 'REJECTED') router.replace('/(verification)/verification-rejected');
  }, [latest?.status, router]);

  const approved = latest?.status === 'APPROVED';
  const needsReview = ['attention', 'error'].includes(latest?.govLookup?.providerStatus ?? '');
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncingRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const ready = approved && user?.usher?.verificationStatus === 'VERIFIED';
  const syncProfile = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setSyncError(null);
    try {
      const updated = await refreshMe();
      if (mounted.current && updated?.usher?.verificationStatus !== 'VERIFIED')
        setSyncError(
          'Your identity is approved, but we couldn’t update your account. Check your connection and try again.',
        );
    } catch {
      if (mounted.current)
        setSyncError('We couldn’t update your account. Check your connection and try again.');
    } finally {
      syncingRef.current = false;
      if (mounted.current) setSyncing(false);
    }
  }, [refreshMe]);
  useEffect(() => {
    if (approved && !ready) void syncProfile();
  }, [approved, ready, syncProfile]);

  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      <QueryState
        query={verifications}
        isEmpty={(items) =>
          !items[0] ||
          (items[0].method !== 'BIOMETRIC' &&
            items[0].status === 'PENDING' &&
            !items[0].idDocumentUrl &&
            !items[0].selfieUrl)
        }
        errorTitle="Couldn’t load your verification"
        empty={
          <EmptyState
            icon="alert-circle"
            title="Finish your identity check"
            subtitle="Complete your identity and selfie check with Smile ID."
            actionLabel="Verify with Smile ID"
            onAction={() => router.replace('/(verification)/id-verification')}
          />
        }
      >
        {() => (
          <>
            <Screen scroll>
              {!approved && (
                <Button
                  variant="ghost"
                  label="Return to identity check"
                  onPress={() => router.replace('/(verification)/id-verification')}
                />
              )}
              {needsReview && (
                <Button
                  variant="ghost"
                  label="Contact support"
                  onPress={() => {
                    void openSupport(
                      'My Smile ID identity check needs review. Please help me complete verification.',
                    );
                  }}
                />
              )}
              <Button
                label={verifications.isFetching || syncing ? 'Checking…' : 'Check latest status'}
                variant="ghost"
                disabled={verifications.isFetching || syncing}
                onPress={() => {
                  void verifications.refetch().then((result) => {
                    if (mounted.current && result.data?.[0]?.status === 'APPROVED')
                      void syncProfile();
                  });
                }}
              />
              {syncError ? <Banner tone="warning" message={syncError} /> : null}
              <Box style={{ paddingHorizontal: 24, paddingTop: 8 }}>
                <StepIndicator
                  total={5}
                  current={4}
                  label={approved ? 'STEP 5 OF 5 · APPROVED' : 'STEP 5 OF 5 · REVIEW'}
                />
              </Box>
              <Box
                flex={1}
                alignItems="center"
                justifyContent="center"
                style={{ paddingHorizontal: 24, gap: 20 }}
              >
                <IconCircle
                  icon={approved ? 'check' : 'clock'}
                  tone={approved ? 'success' : 'gold'}
                  size={96}
                  iconColor={approved ? 'statusSuccess' : 'accentGoldStrong'}
                />
                <Text variant="h1" style={{ textAlign: 'center' }}>
                  {approved
                    ? ready
                      ? 'You’re verified'
                      : 'Identity approved'
                    : needsReview
                      ? 'Your identity check needs review'
                      : 'Verification in progress'}
                </Text>
                <Text variant="body" color="inkMuted" style={{ textAlign: 'center' }}>
                  {approved
                    ? ready
                      ? 'You can now apply to jobs and earn into your wallet.'
                      : 'We’re updating your account so you can start applying. If the update fails, check the latest status to retry.'
                    : needsReview
                      ? 'Your Smile ID check needs a closer look. Our team can help you complete verification.'
                      : 'We’re waiting for your identity check to finish. If you closed the camera before submitting, return to verification to complete it.'}
                </Text>
                <Box
                  backgroundColor="bgSurface"
                  borderWidth={1}
                  borderColor="borderDefault"
                  borderRadius="lg"
                  padding="400"
                  style={{ gap: 12, width: '100%' }}
                >
                  <StatusStep
                    state="done"
                    title="Submitted"
                    subtitle={
                      latest?.method === 'BIOMETRIC'
                        ? 'Identity check started'
                        : 'Documents received'
                    }
                  />
                  <StatusStep
                    state={approved ? 'done' : 'active'}
                    title="Under review"
                    subtitle={approved ? 'Review complete' : 'Our team is checking'}
                  />
                  <StatusStep
                    state={approved ? 'done' : 'todo'}
                    title="Approved"
                    subtitle="You can start applying"
                  />
                </Box>
              </Box>
            </Screen>
            <Box
              backgroundColor="bgSurface"
              style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 16 }}
            >
              <Button
                label={ready ? 'Start applying' : 'Browse jobs while you wait'}
                variant={ready ? 'primary' : 'ghost'}
                onPress={() => router.replace('/(usher)/jobs')}
              />
            </Box>
          </>
        )}
      </QueryState>
    </Box>
  );
}
