/**
 * Job Details (usher) — matches Figma `Usher / 03 Event Details` (47:130). Live:
 * reads the event by id (`useEvent`) and applies via `useApplyToEvent`. Only
 * VERIFIED ushers can apply (the API enforces this; we surface the error).
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { EmptyState } from '../../components/EmptyState.js';
import { Button } from '../../components/Button.js';
import { Icon, type IconName } from '../../components/Icon.js';
import { Loading } from '../../components/Loading.js';
import { useEvent, useApplyToEvent, useSavedJobs, useSaveJob, useUnsaveJob } from '../../lib/hooks.js';
import { hapticSelection } from '../../lib/haptics.js';
import { useToast } from '../../lib/toast.js';
import { money, shortDate, formatTimeRange } from '../../lib/format.js';
import type { Theme } from '../../theme/theme.js';

function DetailRow({ icon, label, value, valueColor = 'inkStrong' }: { icon: IconName; label: string; value: string; valueColor?: keyof Theme['colors'] }) {
  return (
    <Box flexDirection="row" alignItems="center" justifyContent="space-between">
      <Box flexDirection="row" alignItems="center" style={{ gap: 8 }}>
        <Icon name={icon} size={18} color="inkMuted" />
        <Text variant="body" color="inkMuted">
          {label}
        </Text>
      </Box>
      <Text variant="label" style={{ fontSize: 15 }} color={valueColor}>
        {value}
      </Text>
    </Box>
  );
}

export default function EventDetails(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const event = useEvent(id ?? '');
  const apply = useApplyToEvent();
  const saved = useSavedJobs();
  const saveJob = useSaveJob();
  const unsaveJob = useUnsaveJob();
  const toast = useToast();
  const isSaved = (saved.data ?? []).some((s) => s.id === id);

  const onToggleSave = (): void => {
    if (!id) return;
    hapticSelection();
    if (isSaved) unsaveJob.mutate(id);
    else saveJob.mutate(id);
  };

  const onApply = (): void => {
    if (!id) return;
    apply.mutate(id, {
      onSuccess: () => {
        toast.success('Your application was sent. You’ll be notified if you’re booked.', 'Applied');
        router.back();
      },
      onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Please try again.', 'Couldn’t apply'),
    });
  };

  if (event.isLoading) {
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar title="Job details" showBack inset />
        <Loading />
      </Box>
    );
  }
  if (event.isError || !event.data) {
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar title="Job details" showBack inset />
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
  const booked = e._count?.bookings ?? 0;
  const requirements = (e.preferences?.requirements ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Job details" showBack inset />
      <Screen scroll>
        <Box style={{ gap: 20 }}>
          <Box style={{ gap: 4 }}>
            <Text variant="h1">{e.title}</Text>
            <Box flexDirection="row" alignItems="baseline" style={{ gap: 4 }}>
              <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 22, lineHeight: 28, letterSpacing: -0.3 }} color="brandEmerald">
                {money(e.budgetPerHead)}
              </Text>
              <Text variant="body" color="inkMuted">/ head</Text>
            </Box>
          </Box>

          <Box backgroundColor="bgSurface" borderWidth={1} borderColor="borderDefault" borderRadius="lg" padding="400" style={{ gap: 12 }}>
            <DetailRow icon="calendar" label="Date & time" value={`${shortDate(e.eventDate)} · ${formatTimeRange(e.startTime, e.endTime)}`} />
            <DetailRow icon="map-pin" label="Venue" value={e.venue} />
            <DetailRow icon="user-check" label="Dress code" value={e.dressCode ?? e.category} />
            <DetailRow icon="users" label="Slots left" value={`${Math.max(e.headcount - booked, 0)} of ${e.headcount}`} valueColor="accentGoldStrong" />
          </Box>

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

      <Box flexDirection="row" backgroundColor="bgCanvas" style={{ gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 16, borderTopWidth: 1.5, borderTopColor: theme.colors.borderDefault }}>
        <Box>
          <Button label={isSaved ? 'Saved' : 'Save'} variant="secondary" fullWidth={false} onPress={onToggleSave} />
        </Box>
        <Box flex={1}>
          <Button label={apply.isPending ? 'Applying…' : 'Apply now'} onPress={onApply} disabled={apply.isPending} />
        </Box>
      </Box>
    </Box>
  );
}
