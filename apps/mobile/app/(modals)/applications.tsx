/**
 * Applications — matches Figma `Client / 14 Applications` (31:311): a selection
 * banner + applicant cards, with a "Pay & confirm" CTA. Live: the event's
 * applications (`useApplications`, polled). Each card shows the usher's rating,
 * jobs, experience and verified status, taps through to their full profile, and
 * offers Shortlist / Reject. Confirming accepts the selected applicants
 * (`usePatchApplication` → ACCEPTED) then opens Payment Summary.
 */
import { useState } from 'react';
import { Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Avatar } from '../../components/Avatar.js';
import { Button } from '../../components/Button.js';
import { Icon } from '../../components/Icon.js';
import { SkeletonCard } from '../../components/Skeleton.js';
import { EmptyState } from '../../components/EmptyState.js';
import { shadowSm } from '../../theme/shadows.js';
import { fonts } from '../../theme/fonts.js';
import { useApplications, usePatchApplication, useEvent } from '../../lib/hooks.js';
import { useToast } from '../../lib/toast.js';
import { money, formatEventDate } from '../../lib/format.js';
import type { Application } from '../../lib/types.js';

export default function Applications(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = id ?? '';
  const apps = useApplications(eventId);
  const event = useEvent(eventId);
  const patch = usePatchApplication(eventId);
  const toast = useToast();

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  // Rank active applicants by rating then experience; rejected sink to the bottom.
  const list = [...(apps.data ?? [])].sort((a, b) => {
    const ar = a.status === 'REJECTED' ? 1 : 0;
    const br = b.status === 'REJECTED' ? 1 : 0;
    if (ar !== br) return ar - br;
    if (b.usher.ratingAvg !== a.usher.ratingAvg) return b.usher.ratingAvg - a.usher.ratingAvg;
    return b.usher.completedJobsCount - a.usher.completedJobsCount;
  });
  // Highlight the strongest pick when there's a real choice to make.
  const topId = list.length > 1 && list[0].status !== 'REJECTED' && list[0].usher.ratingAvg > 0 ? list[0].id : null;
  const slots = event.data?.headcount ?? 0;
  const perHead = event.data?.budgetPerHead ?? 0;
  const selectedIds = list.filter((a) => selected[a.id]).map((a) => a.id);
  const count = selectedIds.length;

  const openProfile = (usherId: string): void =>
    router.push({ pathname: '/(modals)/staff-profile', params: { id: usherId } });

  const setStatus = (appId: string, status: 'SHORTLISTED' | 'REJECTED'): void => {
    if (status === 'REJECTED') setSelected((s) => ({ ...s, [appId]: false }));
    patch.mutate({ id: appId, status });
  };

  const confirm = async (): Promise<void> => {
    if (count === 0) return;
    setBusy(true);
    try {
      for (const appId of selectedIds) {
        await patch.mutateAsync({ id: appId, status: 'ACCEPTED' });
      }
      router.push({ pathname: '/(modals)/payment-summary', params: { id: eventId, apps: selectedIds.join(',') } });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Please try again.', 'Couldn’t confirm');
    } finally {
      setBusy(false);
    }
  };

  const renderCard = (a: Application, isTop: boolean): React.JSX.Element => {
    const on = !!selected[a.id];
    const name = a.usher.displayName ?? 'Usher';
    const verified = a.usher.verificationStatus === 'VERIFIED';
    const rejected = a.status === 'REJECTED';
    const shortlisted = a.status === 'SHORTLISTED';

    return (
      <Box
        padding="400"
        borderRadius="lg"
        borderWidth={on ? 2 : 1}
        style={[
          {
            gap: 12,
            opacity: rejected ? 0.55 : 1,
            borderColor: on ? theme.colors.brandEmerald : theme.colors.borderDefault,
            backgroundColor: on ? theme.colors.brandEmeraldTintWeak : theme.colors.bgSurface,
          },
          shadowSm,
        ]}
      >
        <Box flexDirection="row" alignItems="center" style={{ gap: 12 }}>
          <Pressable onPress={() => openProfile(a.usher.id)} hitSlop={6}>
            <Avatar name={name} size={48} imageUrl={a.usher.avatarUrl} />
          </Pressable>
          <Pressable style={{ flex: 1 }} onPress={() => openProfile(a.usher.id)}>
            <Box style={{ gap: 4 }}>
              <Box flexDirection="row" alignItems="center" style={{ gap: 6 }}>
                <Text variant="titleM" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {name}
                </Text>
                {verified ? <Icon name="check-circle" size={15} color="brandEmerald" /> : null}
                {isTop && !shortlisted ? (
                  <Box flexDirection="row" alignItems="center" style={{ gap: 3, backgroundColor: theme.colors.brandEmeraldTint, paddingHorizontal: 8, paddingVertical: 2, borderRadius: theme.borderRadii.pill }}>
                    <Icon name="award" size={11} color="brandEmeraldStrong" />
                    <Text style={{ fontFamily: fonts.sansBold, fontSize: 11, lineHeight: 14, letterSpacing: 0.6 }} color="brandEmeraldStrong">
                      Top rated
                    </Text>
                  </Box>
                ) : null}
                {shortlisted ? (
                  <Box style={{ backgroundColor: theme.colors.accentGoldTint, paddingHorizontal: 8, paddingVertical: 2, borderRadius: theme.borderRadii.pill }}>
                    <Text style={{ fontFamily: fonts.sansBold, fontSize: 11, lineHeight: 14, letterSpacing: 1 }} color="accentGoldStrong">
                      Shortlisted
                    </Text>
                  </Box>
                ) : null}
              </Box>
              <Box flexDirection="row" alignItems="center" style={{ gap: 4 }}>
                <Icon name="star" size={14} color="accentGold" />
                <Text variant="bodySm" color="inkMuted">
                  {a.usher.ratingAvg.toFixed(1)} · {a.usher.completedJobsCount} jobs
                  {a.usher.yearsExperience > 0 ? ` · ${a.usher.yearsExperience}y exp` : ''} · {money(perHead)}
                </Text>
              </Box>
            </Box>
          </Pressable>
          {!rejected ? (
            <Pressable
              onPress={() => setSelected((s) => ({ ...s, [a.id]: !s[a.id] }))}
              hitSlop={8}
              accessibilityRole="checkbox"
              accessibilityLabel={`Select ${name}`}
              accessibilityState={{ checked: on }}
            >
              <Box
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: on ? 0 : 1.5,
                  borderColor: theme.colors.borderStrong,
                  backgroundColor: on ? theme.colors.brandEmerald : theme.colors.bgSurface,
                }}
              >
                {on ? <Icon name="check" size={16} color="inverseInk" /> : null}
              </Box>
            </Pressable>
          ) : (
            <Text variant="labelSm" color="statusDanger">Rejected</Text>
          )}
        </Box>

        {!rejected ? (
          <Box flexDirection="row" style={{ gap: 8 }}>
            <Button label="View profile" variant="secondary" size="md" fullWidth={false} onPress={() => openProfile(a.usher.id)} />
            {!shortlisted ? (
              <Button label="Shortlist" variant="ghost" size="md" fullWidth={false} onPress={() => setStatus(a.id, 'SHORTLISTED')} />
            ) : null}
            <Button label="Reject" variant="ghost" size="md" fullWidth={false} onPress={() => setStatus(a.id, 'REJECTED')} />
          </Box>
        ) : null}
      </Box>
    );
  };

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Applications" showBack inset />
      <Screen scroll>
        {/* event context */}
        {event.data ? (
          <Box style={{ gap: 2, marginBottom: 12 }}>
            <Text variant="headingS" numberOfLines={1}>{event.data.title}</Text>
            <Text variant="bodySm" color="inkMuted">
              {formatEventDate(event.data.eventDate)} · {slots} {slots === 1 ? 'usher' : 'ushers'} needed
            </Text>
          </Box>
        ) : null}

        <Box
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
          backgroundColor="brandEmeraldTintWeak"
          borderRadius="md"
          padding="400"
          marginBottom="300"
        >
          <Box flexDirection="row" alignItems="center" style={{ gap: 8 }}>
            <Icon name="check" size={18} color="brandEmerald" />
          <Text variant="labelLg" color="brandEmerald">
              {count} of {slots} open slots selected
            </Text>
          </Box>
          <Text variant="bodySm" color="inkMuted">Tap to choose</Text>
        </Box>

        {apps.isLoading ? (
          <Box style={{ gap: 12 }}>
            {[0, 1, 2].map((i) => (
              <SkeletonCard key={i} lines={2} />
            ))}
          </Box>
        ) : apps.isError ? (
          <Box style={{ paddingTop: 32 }}>
            <EmptyState
              icon="alert-circle"
              title="Couldn’t load applications"
              subtitle="Check your connection and try again."
              actionLabel="Try again"
              onAction={() => {
                void apps.refetch();
              }}
            />
          </Box>
        ) : list.length === 0 ? (
          <Box style={{ paddingTop: 32 }}>
            <EmptyState
              icon="users"
              title="No applications yet"
              subtitle="Ushers who apply to this event will appear here. This list refreshes automatically."
            />
          </Box>
        ) : (
          <Box style={{ gap: 12 }}>{list.map((a) => <Box key={a.id}>{renderCard(a, a.id === topId)}</Box>)}</Box>
        )}

        <Box style={{ flex: 1, minHeight: 16 }} />
        <Box style={{ gap: 8, paddingBottom: insets.bottom }}>
          <Button
            label={busy ? 'Confirming…' : `Pay & confirm · ${money(perHead * count)}`}
            disabled={count === 0 || busy}
            onPress={() => { void confirm(); }}
          />
          <Text variant="bodySm" color="inkFaint" style={{ textAlign: 'center' }}>
            {count} {count === 1 ? 'usher' : 'ushers'} · funds held safely until check-in
          </Text>
        </Box>
      </Screen>
    </Box>
  );
}
