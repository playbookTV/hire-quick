import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Text } from '../../theme/restyle.js';
import { kobo, splitFee, PLATFORM_FEE_BPS } from '@hq/shared';
import { screenTokens } from '../../theme/token-manager.js';
import { ScreenHeading } from '../../components/ScreenHeading.js';
import { Button } from '../../components/Button.js';
import { Segmented } from '../../components/Segmented.js';
import { JobCard } from '../../components/JobCard.js';
import { EmptyState } from '../../components/EmptyState.js';
import { SkeletonCard } from '../../components/Skeleton.js';
import {
  useEvents,
  useMyApplications,
  useSavedJobs,
  useSaveJob,
  useUnsaveJob,
} from '../../lib/hooks.js';
import { money, dateTime } from '../../lib/format.js';
import type { ApplicationStatus, EventResource } from '../../lib/types.js';

type Tab = 'available' | 'applied' | 'saved';
const TABS = [
  { value: 'available' as const, label: 'Available' },
  { value: 'applied' as const, label: 'Applied' },
  { value: 'saved' as const, label: 'Saved' },
];

const STATUS_BADGE: Record<
  ApplicationStatus,
  { label: string; tone: 'gold' | 'emerald' | 'danger' | 'muted' }
> = {
  APPLIED: { label: 'Applied', tone: 'muted' },
  SHORTLISTED: { label: 'Shortlisted', tone: 'gold' },
  ACCEPTED: { label: 'Selected · awaiting payment', tone: 'gold' },
  REJECTED: { label: 'Not selected', tone: 'danger' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'muted' },
};

export default function Jobs(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('available');

  const events = useEvents();
  const applied = useMyApplications();
  const saved = useSavedJobs();
  const saveJob = useSaveJob();
  const unsaveJob = useUnsaveJob();

  const open = (id: string): void =>
    router.push({ pathname: '/(modals)/event-details', params: { id } });

  const appliedIds = useMemo(
    () => new Set((applied.data ?? []).map((a) => a.event.id)),
    [applied.data],
  );
  const savedIds = useMemo(() => new Set((saved.data ?? []).map((e) => e.id)), [saved.data]);

  const active = tab === 'available' ? events : tab === 'applied' ? applied : saved;
  const onRefresh = (): void => {
    void Promise.all([events.refetch(), applied.refetch(), saved.refetch()]);
  };

  const renderEventCard = (
    e: EventResource,
    opts?: {
      badge?: string;
      badgeTone?: 'gold' | 'emerald' | 'danger' | 'muted';
      bookingId?: string;
    },
  ): React.JSX.Element => {
    const isSaved = savedIds.has(e.id);
    return (
      <JobCard
        key={e.id}
        title={e.title}
        pay={money(splitFee(kobo(e.budgetPerHead), PLATFORM_FEE_BPS).payout)}
        date={dateTime(e.eventDate, e.startTime)}
        slots={e.staffing ? `${e.staffing.available} of ${e.headcount} slots left` : undefined}
        distance={e.venue}
        dress={e.dressCode ?? e.category}
        badge={opts?.badge}
        badgeTone={opts?.badgeTone}
        saved={isSaved}
        onToggleSave={() => (isSaved ? unsaveJob.mutate(e.id) : saveJob.mutate(e.id))}
        actionLabel="View"
        onAction={() =>
          opts?.bookingId
            ? router.push({
                pathname: '/(modals)/booking-details',
                params: { booking: opts.bookingId },
              })
            : open(e.id)
        }
        onPress={() =>
          opts?.bookingId
            ? router.push({
                pathname: '/(modals)/booking-details',
                params: { booking: opts.bookingId },
              })
            : open(e.id)
        }
      />
    );
  };

  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: screenTokens.gutter,
          paddingTop: screenTokens.top,
          paddingBottom: 24,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={active.isFetching} onRefresh={onRefresh} />}
      >
        <ScreenHeading title="Jobs" />
        <Segmented options={TABS} value={tab} onChange={setTab} />
        <Box flexDirection="row" alignItems="center" justifyContent="space-between" gap="200">
          <Text variant="bodySm" color="inkMuted">
            {active.isLoading
              ? 'Finding jobs…'
              : active.isError
                ? 'Results unavailable'
                : `${active.data?.length ?? 0} ${tab === 'applied' ? 'application' : 'job'}${active.data?.length === 1 ? '' : 's'}`}
          </Text>
          <Button
            label="My bookings"
            variant="ghost"
            size="md"
            fullWidth={false}
            onPress={() => router.push('/(modals)/my-bookings')}
          />
        </Box>

        {active.isLoading ? (
          <Box style={{ gap: 12 }}>
            {[0, 1, 2].map((i) => (
              <SkeletonCard key={i} lines={2} />
            ))}
          </Box>
        ) : active.isError ? (
          <Box style={{ paddingTop: 40 }}>
            <EmptyState
              icon="wifi-off"
              title="Couldn’t load jobs"
              subtitle="Check your connection and try again."
              actionLabel="Try again"
              onAction={onRefresh}
            />
          </Box>
        ) : tab === 'available' ? (
          (events.data ?? []).length === 0 ? (
            <Box style={{ paddingTop: 40 }}>
              <EmptyState
                icon="search"
                title="No open jobs right now"
                subtitle="New jobs are posted across Lagos every day — check back soon."
                actionLabel="Refresh"
                onAction={() => {
                  void events.refetch();
                }}
              />
            </Box>
          ) : (
            <Box style={{ gap: 12 }}>
              {(events.data ?? []).map((e) =>
                renderEventCard(
                  e,
                  appliedIds.has(e.id) ? { badge: 'Applied', badgeTone: 'emerald' } : undefined,
                ),
              )}
            </Box>
          )
        ) : tab === 'applied' ? (
          (applied.data ?? []).length === 0 ? (
            <Box style={{ paddingTop: 40 }}>
              <EmptyState
                icon="send"
                title="No applications yet"
                subtitle="Apply to jobs in the Available tab and track their status here."
                actionLabel="Browse jobs"
                onAction={() => setTab('available')}
              />
            </Box>
          ) : (
            <Box style={{ gap: 12 }}>
              {(applied.data ?? []).map((a) => {
                const b = STATUS_BADGE[a.status] ?? {
                  label: 'Status unavailable',
                  tone: 'muted' as const,
                };
                return renderEventCard(a.event, {
                  badge: a.booking
                    ? a.booking.status === 'PENDING_PAYMENT'
                      ? 'Awaiting payment'
                      : a.booking.status === 'CONFIRMED'
                        ? 'Booked'
                        : a.booking.status.toLowerCase().replaceAll('_', ' ')
                    : b.label,
                  badgeTone:
                    a.booking && a.booking.status !== 'PENDING_PAYMENT' ? 'emerald' : b.tone,
                  ...(a.booking ? { bookingId: a.booking.id } : {}),
                });
              })}
            </Box>
          )
        ) : (saved.data ?? []).length === 0 ? (
          <Box style={{ paddingTop: 40 }}>
            <EmptyState
              icon="bookmark"
              title="No saved jobs"
              subtitle="Tap the bookmark on any job to save it for later."
              actionLabel="Browse jobs"
              onAction={() => setTab('available')}
            />
          </Box>
        ) : (
          <Box style={{ gap: 12 }}>{(saved.data ?? []).map((e) => renderEventCard(e))}</Box>
        )}
      </ScrollView>
    </Box>
  );
}
