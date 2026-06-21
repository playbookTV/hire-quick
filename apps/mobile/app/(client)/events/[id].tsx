/**
 * Event detail — GET /api/events/:id. Shows the brief, staffing economics
 * (headcount × budget = escrow total), and applicant/booking counts. Reviewing
 * applicants and confirm-&-pay land in a later phase.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { kobo, formatNaira } from '@hq/shared';
import { Screen } from '../../../components/Screen.js';
import { AppBar } from '../../../components/AppBar.js';
import { Card } from '../../../components/Card.js';
import { StatusPill } from '../../../components/StatusPill.js';
import { MetaRow } from '../../../components/MetaRow.js';
import { KeyValueRow } from '../../../components/KeyValueRow.js';
import { SectionHeader } from '../../../components/SectionHeader.js';
import { Button } from '../../../components/Button.js';
import { Banner } from '../../../components/Banner.js';
import { EmptyState } from '../../../components/EmptyState.js';
import { Loading } from '../../../components/Loading.js';
import { Box, Text } from '../../../theme/restyle.js';
import { useEvent } from '../../../lib/hooks.js';
import { formatEventDate, formatTimeRange } from '../../../lib/format.js';
import { ApiError } from '../../../lib/api-error.js';

export default function EventDetail(): React.JSX.Element {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: event, isLoading, error, refetch } = useEvent(id ?? '');

  if (isLoading) {
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar showBack inset />
        <Loading />
      </Box>
    );
  }

  if (error || !event) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar showBack inset />
        <Box flex={1} justifyContent="center">
          <EmptyState
            icon="alert-circle"
            tone="danger"
            title={notFound ? 'Event not found' : 'Couldn’t load this event'}
            subtitle={notFound ? 'It may have been removed.' : 'Check your connection and try again.'}
            actionLabel="Retry"
            onAction={() => refetch()}
          />
        </Box>
      </Box>
    );
  }

  const total = kobo(event.headcount * event.budgetPerHead);
  const applicants = event._count?.applications ?? 0;
  const requirements = event.preferences?.requirements;

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar showBack inset title="Event" />
      <Screen scroll>
        <Box flexDirection="row" alignItems="flex-start" justifyContent="space-between" gap="300" marginBottom="300">
          <Text variant="h1" style={{ flex: 1 }}>
            {event.title}
          </Text>
          <StatusPill status={event.status} />
        </Box>

        <Card>
          <MetaRow icon="map-pin" text={event.venue} />
          <MetaRow icon="calendar" text={formatEventDate(event.eventDate)} />
          <MetaRow icon="clock" text={formatTimeRange(event.startTime, event.endTime)} />
          <MetaRow icon="tag" text={event.category} />
          {event.dressCode ? <MetaRow icon="user-check" text={`Dress: ${event.dressCode}`} /> : null}
          {event.accommodation ? (
            <MetaRow
              icon="home"
              text={event.accommodation === 'PROVIDED' ? 'Accommodation provided' : 'No accommodation'}
            />
          ) : null}
        </Card>

        <Box height={16} />
        <SectionHeader title="Staffing" />
        <Card>
          <KeyValueRow label="Staff needed" value={String(event.headcount)} />
          <KeyValueRow label="Budget / head" value={formatNaira(kobo(event.budgetPerHead))} />
          <Box height={1} backgroundColor="borderDefault" marginVertical="200" />
          <KeyValueRow label="Total to escrow" value={formatNaira(total)} tone="brand" emphasize />
        </Card>

        {requirements ? (
          <>
            <Box height={16} />
            <SectionHeader title="Requirements" />
            <Card>
              <Text variant="body" color="inkBody">
                {requirements}
              </Text>
            </Card>
          </>
        ) : null}

        <Box height={16} />
        <Banner
          tone="info"
          title={applicants > 0 ? `${applicants} applicant${applicants === 1 ? '' : 's'}` : 'No applicants yet'}
          message={
            applicants > 0
              ? 'Review applicants and confirm your staff. Funds are held in escrow until verified attendance.'
              : 'Share your event — ushers can apply, then you confirm and pay into escrow.'
          }
        />

        <Box marginTop="500">
          <Button
            label="Review applicants"
            disabled={applicants === 0}
            onPress={() => {
              /* Applicant review + confirm-&-pay land in a later phase. */
            }}
          />
        </Box>
      </Screen>
    </Box>
  );
}
