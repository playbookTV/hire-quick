/**
 * Event detail — matches Figma `Client / 13 Event Management` (30:291):
 * title + StatusPill + meta, a confirmed/slots progress card with dots, the
 * staffing economics, quick action chips, and a "Review applications" CTA. Live
 * from GET /api/events/:id (roster detail lands with the bookings API).
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { kobo, formatNaira } from '@hq/shared';
import { Screen } from '../../../components/Screen.js';
import { AppBar } from '../../../components/AppBar.js';
import { Card } from '../../../components/Card.js';
import { StatusPill } from '../../../components/StatusPill.js';
import { CoverImage } from '../../../components/CoverImage.js';
import { CategoryBadge } from '../../../components/CategoryBadge.js';
import { MetaRow } from '../../../components/MetaRow.js';
import { KeyValueRow } from '../../../components/KeyValueRow.js';
import { SectionHeader } from '../../../components/SectionHeader.js';
import { Button } from '../../../components/Button.js';
import { Dot } from '../../../components/Dot.js';
import { EmptyState } from '../../../components/EmptyState.js';
import { Loading } from '../../../components/Loading.js';
import { useTheme, Box, Text } from '../../../theme/restyle.js';
import { fonts } from '../../../theme/fonts.js';
import { useEvent, useBookings } from '../../../lib/hooks.js';
import { formatEventDate, formatTimeRange } from '../../../lib/format.js';
import { ApiError } from '../../../lib/api-error.js';

function ActionChip({ label, danger, onPress }: { label: string; danger?: boolean; onPress?: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: theme.borderRadii.pill,
        borderWidth: 1.5,
        borderColor: danger ? theme.colors.statusDanger : theme.colors.borderStrong,
      }}
    >
      <Text
        style={{ fontFamily: fonts.sansSemibold, fontSize: 13, lineHeight: 16, letterSpacing: 0.2 }}
        color={danger ? 'statusDanger' : 'inkDefault'}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function EventDetail(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: event, isLoading, error, refetch } = useEvent(id ?? '');
  const bookings = useBookings();
  const eventBookings = (bookings.data ?? []).filter((b) => b.eventId === id);
  const firstBooking = eventBookings[0]?.id;

  if (isLoading) {
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar showBack inset title="Event" />
        <Loading />
      </Box>
    );
  }

  if (error || !event) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar showBack inset title="Event" />
        <Box flex={1} justifyContent="center">
          <EmptyState
            icon="alert-circle"
            tone="danger"
            title={notFound ? 'Event not found' : 'Couldn’t load this event'}
            subtitle={notFound ? 'It may have been removed.' : 'Check your connection and try again.'}
            actionLabel="Retry"
            onAction={() => { void refetch(); }}
          />
        </Box>
      </Box>
    );
  }

  const total = kobo(event.headcount * event.budgetPerHead);
  const applicants = event._count?.applications ?? 0;
  const confirmed = Math.min(event._count?.bookings ?? 0, event.headcount);
  const open = Math.max(0, event.headcount - confirmed);
  const requirements = event.preferences?.requirements;
  const dots = Math.min(event.headcount, 12);
  // Editable only before any booking is confirmed (mirrors the PATCH guard).
  const editable =
    (event.status === 'OPEN' || event.status === 'PARTIALLY_STAFFED') && (event._count?.bookings ?? 0) === 0;

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar showBack inset title="Event" />
      <Screen scroll>
        {/* hero */}
        <Box marginBottom="400">
          <CoverImage category={event.category} height={110}>
            <CategoryBadge category={event.category} size="sm" />
          </CoverImage>
        </Box>

        {/* header */}
        <Box flexDirection="row" alignItems="center" justifyContent="space-between" style={{ gap: 12 }} marginBottom="200">
          <Text variant="h1" style={{ flex: 1 }} numberOfLines={2}>
            {event.title}
          </Text>
          <StatusPill status={event.status} />
        </Box>
        <MetaRow icon="calendar" text={`${formatEventDate(event.eventDate)} · ${formatTimeRange(event.startTime, event.endTime)}`} />
        <MetaRow icon="map-pin" text={event.state ? `${event.venue} · ${event.state}` : event.venue} />

        {/* progress */}
        <Box height={20} />
        <Card>
          <Box flexDirection="row" alignItems="center" justifyContent="space-between" marginBottom="300">
            <Text variant="titleM">
              {confirmed} of {event.headcount} confirmed
            </Text>
            <Text variant="bodySm" color="inkMuted">
              {open} slot{open === 1 ? '' : 's'} open
            </Text>
          </Box>
          <Box flexDirection="row" style={{ gap: 4 }}>
            {Array.from({ length: dots }).map((_, i) => (
              <Dot key={i} filled={i < confirmed} />
            ))}
          </Box>
        </Card>

        {/* staffing */}
        <Box height={20} />
        <SectionHeader title="Staffing" />
        <Card>
          <KeyValueRow label="Staff needed" value={String(event.headcount)} />
          <KeyValueRow label="Budget / head" value={formatNaira(kobo(event.budgetPerHead))} />
          {event.dressCode ? <KeyValueRow label="Dress code" value={event.dressCode} /> : null}
          <Box height={1} backgroundColor="borderDefault" marginVertical="200" />
          <KeyValueRow label="Total held safely" value={formatNaira(total)} tone="brand" emphasize />
        </Card>

        {requirements ? (
          <>
            <Box height={20} />
            <SectionHeader title="Requirements" />
            <Card>
              <Text variant="body" color="inkDefault">
                {requirements}
              </Text>
            </Card>
          </>
        ) : null}

        {/* primary action */}
        <Box height={20} />
        <Button
          label={`Review applications${applicants ? ` (${applicants})` : ''}`}
          disabled={applicants === 0}
          onPress={() => router.push({ pathname: '/(modals)/applications', params: { id } })}
        />

        {/* secondary actions */}
        <Box height={16} />
        <Box flexDirection="row" flexWrap="wrap" style={{ gap: 8 }}>
          {editable ? (
            <ActionChip label="Edit event" onPress={() => router.push({ pathname: '/(modals)/edit-event', params: { id } })} />
          ) : null}
          {eventBookings.length > 0 ? (
            <ActionChip label="Event day" onPress={() => router.push({ pathname: '/(modals)/event-day', params: { id } })} />
          ) : null}
          <ActionChip label="Message all" onPress={() => router.push('/(client)/messages')} />
          {eventBookings.length === 1 && firstBooking ? (
            <ActionChip label="Cancel booking" danger onPress={() => router.push({ pathname: '/(modals)/cancellation', params: { booking: firstBooking } })} />
          ) : eventBookings.length > 1 ? (
            // Multi-usher events: cancel per-usher from the Event-Day roster, not a single
            // chip that would silently cancel only the first booking (C5).
            <ActionChip label="Cancel a booking" danger onPress={() => router.push({ pathname: '/(modals)/event-day', params: { id } })} />
          ) : null}
        </Box>
        <Box style={{ height: insets.bottom }} />
      </Screen>
    </Box>
  );
}
