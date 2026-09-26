import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Text } from '../../theme/restyle.js';
import { kobo, splitFee, PLATFORM_FEE_BPS } from '@hq/shared';
import { StatusPill } from '../../components/StatusPill.js';
import { Card } from '../../components/Card.js';
import { KeyValueRow } from '../../components/KeyValueRow.js';
import { screenTokens } from '../../theme/token-manager.js';
import { useAuth } from '../../lib/auth-context.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { EmptyState } from '../../components/EmptyState.js';
import { Button } from '../../components/Button.js';
import { Icon, type IconName } from '../../components/Icon.js';
import { Loading } from '../../components/Loading.js';
import { useEvent, useMyApplications, useApplyToEvent, useSavedJobs } from '../../lib/hooks.js';
import { useJobBookmark } from '../../lib/use-job-bookmark.js';
import { hapticSelection } from '../../lib/haptics.js';
import { useToast } from '../../lib/toast.js';
import { money, shortDate, formatTimeRange } from '../../lib/format.js';
import type { Theme } from '../../theme/theme.js';

function DetailRow({
  icon,
  label,
  value,
  valueColor = 'inkStrong',
}: {
  icon: IconName;
  label: string;
  value: string;
  valueColor?: keyof Theme['colors'];
}) {
  return (
    <Box
      flexDirection="row"
      alignItems="flex-start"
      gap="300"
      accessibilityLabel={`${label}: ${value}`}
    >
      <Icon name={icon} size={18} color="inkMuted" />
      <Text
        variant="bodySm"
        color={valueColor === 'inkStrong' ? 'inkMuted' : valueColor}
        style={{ flex: 1 }}
      >
        {value}
      </Text>
    </Box>
  );
}

export default function EventDetails(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const event = useEvent(id ?? '');
  const apply = useApplyToEvent();
  const applications = useMyApplications();
  const { user } = useAuth();
  const saved = useSavedJobs();
  const bookmark = useJobBookmark();
  const toast = useToast();
  const isSaved = (saved.data ?? []).some((s) => s.id === id);

  const onToggleSave = (): void => {
    if (!id) return;
    hapticSelection();
    void bookmark.toggle(id, isSaved);
  };

  const onApply = (): void => {
    if (!id) return;
    apply.mutate(id, {
      onSuccess: () => {
        toast.success('Your application was sent. You’ll be notified if you’re booked.', 'Applied');
        router.back();
      },
      onError: (e: unknown) =>
        toast.error(e instanceof Error ? e.message : 'Please try again.', 'Couldn’t apply'),
    });
  };

  if (event.isLoading) {
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar title="Job" showBack inset />
        <Loading />
      </Box>
    );
  }
  if (event.isError || !event.data) {
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar title="Job" showBack inset />
        <Box style={{ paddingTop: 40 }}>
          <EmptyState
            icon="alert-circle"
            title="Couldn’t load this job"
            subtitle="Check your connection and try again."
            actionLabel="Try again"
            onAction={() => {
              void event.refetch();
            }}
          />
        </Box>
      </Box>
    );
  }

  const e = event.data;
  const estimate = splitFee(kobo(e.budgetPerHead), PLATFORM_FEE_BPS);
  const alreadyApplied = (applications.data ?? []).some(
    (a) => a.event.id === id && a.status !== 'WITHDRAWN',
  );
  const closed = !['OPEN', 'PARTIALLY_STAFFED'].includes(e.status);
  const verified = user?.usher?.verificationStatus === 'VERIFIED';
  const requirements = (e.preferences?.requirements ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Job" showBack inset />
      <Screen scroll>
        <Box style={{ gap: 20 }}>
          <Text variant="h1">{e.title}</Text>
          <StatusPill status={e.status} label={e.status === 'OPEN' ? 'Recruiting' : undefined} />

          <Box
            backgroundColor="bgSurface"
            borderWidth={1}
            borderColor="borderDefault"
            borderRadius="lg"
            padding="400"
            style={{ gap: 12 }}
          >
            <DetailRow
              icon="calendar"
              label="Date & time"
              value={`${shortDate(e.eventDate)} · ${formatTimeRange(e.startTime, e.endTime)}`}
            />
            <DetailRow
              icon="map-pin"
              label="Venue"
              value={e.state && !e.venue.includes(e.state) ? `${e.venue}, ${e.state}` : e.venue}
            />
            <DetailRow icon="user-check" label="Dress code" value={e.dressCode ?? e.category} />
            {e.preferences?.hairstyle ? (
              <DetailRow icon="scissors" label="Hairstyle" value={e.preferences.hairstyle} />
            ) : null}
            <DetailRow
              icon="users"
              label="Slots left"
              value={
                e.staffing
                  ? `${e.staffing.available} of ${e.headcount} slots left`
                  : 'See booking availability'
              }
              valueColor="accentGoldStrong"
            />
          </Box>

          <Card>
            <KeyValueRow label="Event budget" value={money(e.budgetPerHead)} />
            <KeyValueRow label="Commission (15%)" value={`−${money(estimate.fee)}`} />
            <Box height={1} backgroundColor="borderDefault" marginVertical="200" />
            <KeyValueRow label="Estimated earnings" value={money(estimate.payout)} emphasize />
            <Text variant="bodySm" color="inkMuted" marginTop="200">
              Eligible for wallet release from 72 hours after event end, once completed and with no
              open dispute.
            </Text>
          </Card>

          {requirements.length > 0 ? (
            <Box style={{ gap: 8 }}>
              <Text variant="headingS">Requirements</Text>
              {requirements.map((r) => (
                <Box key={r} flexDirection="row" alignItems="flex-start" style={{ gap: 8 }}>
                  <Box style={{ paddingTop: 3 }}>
                    <Icon name="check" size={16} color="brandEmerald" />
                  </Box>
                  <Text variant="body" color="inkDefault" style={{ flex: 1 }}>
                    {r}
                  </Text>
                </Box>
              ))}
            </Box>
          ) : null}
        </Box>
      </Screen>

      <Box
        backgroundColor="bgCanvas"
        style={{
          gap: 8,
          paddingHorizontal: screenTokens.gutter,
          paddingTop: 12,
          paddingBottom: insets.bottom + 12,
        }}
      >
        <Button
          label={
            alreadyApplied
              ? 'Already applied'
              : closed
                ? 'This job is no longer available'
                : !verified
                  ? user?.usher?.verificationStatus === 'PENDING'
                    ? 'Check verification status'
                    : 'Verify your identity to apply'
                  : 'Apply for this job'
          }
          onPress={() => {
            if (verified) onApply();
            else
              router.push(
                user?.usher?.verificationStatus === 'PENDING'
                  ? '/(verification)/awaiting-approval'
                  : '/(verification)/id-verification',
              );
          }}
          loading={apply.isPending}
          disabled={alreadyApplied || closed || applications.isLoading}
        />
        <Button
          label={
            saved.isError
              ? 'Retry saved jobs'
              : bookmark.pending.has(id ?? '')
                ? 'Updating…'
                : isSaved
                  ? 'Saved · remove'
                  : 'Save for later'
          }
          loading={bookmark.pending.has(id ?? '')}
          disabled={saved.isLoading}
          variant="ghost"
          onPress={() => {
            if (saved.isError) void saved.refetch();
            else onToggleSave();
          }}
        />
      </Box>
    </Box>
  );
}
