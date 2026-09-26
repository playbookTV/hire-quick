import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { kobo, formatNaira } from '@hq/shared';
import { Screen } from '../../../components/Screen.js';
import { AppBar } from '../../../components/AppBar.js';
import { Card } from '../../../components/Card.js';
import { StatusPill } from '../../../components/StatusPill.js';
import { Icon } from '../../../components/Icon.js';
import { screenTokens } from '../../../theme/token-manager.js';
import { KeyValueRow } from '../../../components/KeyValueRow.js';
import { SectionHeader } from '../../../components/SectionHeader.js';
import { Button } from '../../../components/Button.js';
import { EmptyState } from '../../../components/EmptyState.js';
import { Loading } from '../../../components/Loading.js';
import { useTheme, Box, Text } from '../../../theme/restyle.js';
import { fonts } from '../../../theme/fonts.js';
import { useEvent, useBookings } from '../../../lib/hooks.js';
import { formatEventDate, formatTimeRange } from '../../../lib/format.js';
import { ApiError } from '../../../lib/api-error.js';

function ActionChip({
  label,
  danger,
  onPress,
}: {
  label: string;
  danger?: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        paddingHorizontal: 16,
        paddingVertical: 12,
        minHeight: 44,
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
            subtitle={
              notFound ? 'It may have been removed.' : 'Check your connection and try again.'
            }
            actionLabel="Retry"
            onAction={() => {
              void refetch();
            }}
          />
        </Box>
      </Box>
    );
  }

  const total = kobo(event.headcount * event.budgetPerHead);
  const applicants = event._count?.applications ?? 0;
  const confirmed = event.staffing?.confirmed ?? 0;
  const open = event.staffing?.available ?? 0;
  const requirements = event.preferences?.requirements;
  // Editable only before any booking is confirmed (mirrors the PATCH guard).
  const editable =
    (event.status === 'OPEN' || event.status === 'PARTIALLY_STAFFED') &&
    (event._count?.bookings ?? 0) === 0;

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar showBack inset title="Event" />
      <Screen scroll>
        <Box gap="400">
          <Text variant="h1">{event.title}</Text>
          <StatusPill
            status={event.status}
            label={event.status === 'OPEN' ? 'Recruiting' : undefined}
          />
          <Card>
            <Box gap="400">
              {(
                [
                  [
                    'calendar',
                    'Date & time',
                    `${formatEventDate(event.eventDate)} · ${formatTimeRange(event.startTime, event.endTime)}`,
                  ],
                  [
                    'map-pin',
                    'Venue',
                    event.state ? `${event.venue}, ${event.state}` : event.venue,
                  ],
                  ['user', 'Headcount', `${event.headcount} ushers`],
                  ['briefcase', 'Dress code', event.dressCode ?? event.category],
                ] as const
              ).map(([icon, label, value]) => (
                <Box key={label} flexDirection="row" alignItems="flex-start" gap="300">
                  <Icon name={icon} size={18} color="inkMuted" />
                  <Box flex={1} gap="100">
                    <Text variant="bodySm" color="inkMuted">
                      {label}
                    </Text>
                    <Text variant="label">{value}</Text>
                  </Box>
                </Box>
              ))}
            </Box>
          </Card>
          <Card>
            <Text variant="overline" color="inkMuted" marginBottom="200">
              BUDGET
            </Text>
            <KeyValueRow label="Per usher" value={formatNaira(kobo(event.budgetPerHead))} />
            <KeyValueRow label={`${event.headcount} ushers`} value={formatNaira(total)} emphasize />
            <Text variant="bodySm" color="inkMuted" marginTop="200">
              Payments and held funds are shown per booking.
            </Text>
          </Card>
          <Box gap="200">
            <Box flexDirection="row" flexWrap="wrap" justifyContent="space-between" gap="100">
              <Text variant="label">
                {confirmed} of {event.headcount} confirmed
              </Text>
              <Text variant="bodySm" color="inkMuted">
                {open} slots open
              </Text>
            </Box>
            <Box height={6} backgroundColor="bgSubtle" borderRadius="pill" overflow="hidden">
              <Box
                height={6}
                backgroundColor="brandAccent"
                style={{
                  width: `${event.headcount ? Math.min(100, (confirmed / event.headcount) * 100) : 0}%`,
                }}
              />
            </Box>
            {(event.staffing?.reserved ?? 0) > 0 ? (
              <Text variant="bodySm" color="moneyHeld">
                {event.staffing?.reserved} awaiting payment
              </Text>
            ) : null}
          </Box>
        </Box>

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

        {/* secondary actions */}
        <Box height={16} />
        <Box flexDirection="row" flexWrap="wrap" style={{ gap: 8 }}>
          <ActionChip
            label="Invitations"
            onPress={() =>
              router.push({ pathname: '/(modals)/invitations', params: { event: id } })
            }
          />
          <ActionChip
            label="Bookings"
            onPress={() =>
              router.push({ pathname: '/(modals)/my-bookings', params: { event: id } })
            }
          />
          {editable ? (
            <ActionChip
              label="Edit event"
              onPress={() => router.push({ pathname: '/(modals)/edit-event', params: { id } })}
            />
          ) : null}
          {eventBookings.length > 0 ? (
            <ActionChip
              label="Event day"
              onPress={() => router.push({ pathname: '/(modals)/event-day', params: { id } })}
            />
          ) : null}
          <ActionChip label="Message all" onPress={() => router.push('/(client)/messages')} />
          {eventBookings.length === 1 && firstBooking ? (
            <ActionChip
              label="Cancel booking"
              danger
              onPress={() =>
                router.push({
                  pathname: '/(modals)/cancellation',
                  params: { booking: firstBooking },
                })
              }
            />
          ) : eventBookings.length > 1 ? (
            // Multi-usher events: cancel per-usher from the Event-Day roster, not a single
            // chip that would silently cancel only the first booking (C5).
            <ActionChip
              label="Cancel a booking"
              danger
              onPress={() => router.push({ pathname: '/(modals)/event-day', params: { id } })}
            />
          ) : null}
        </Box>
        <Box style={{ height: insets.bottom }} />
      </Screen>
      <Box
        backgroundColor="bgCanvas"
        style={{
          paddingHorizontal: screenTokens.gutter,
          paddingTop: 12,
          paddingBottom: insets.bottom + 12,
        }}
      >
        <Button
          label={
            ['OPEN', 'PARTIALLY_STAFFED'].includes(event.status)
              ? `Select staff & pay${applicants ? ` (${applicants})` : ''}`
              : 'View applications'
          }
          onPress={() => router.push({ pathname: '/(modals)/applications', params: { id } })}
        />
      </Box>
    </Box>
  );
}
