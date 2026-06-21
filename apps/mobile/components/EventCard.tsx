/**
 * EventCard — an event summary used on the client home and the events list.
 * Composes Card + StatusPill + MetaRow and formats money via @hq/shared.
 */
import { kobo, formatNaira } from '@hq/shared';
import { Box, Text } from '../theme/restyle.js';
import { Card } from './Card.js';
import { StatusPill } from './StatusPill.js';
import { MetaRow } from './MetaRow.js';
import { formatEventDate, formatTimeRange } from '../lib/format.js';
import type { EventResource } from '../lib/types.js';

interface EventCardProps {
  event: EventResource;
  onPress?: () => void;
}

export function EventCard({ event, onPress }: EventCardProps): React.JSX.Element {
  return (
    <Card onPress={onPress}>
      <Box flexDirection="row" alignItems="flex-start" justifyContent="space-between" gap="300" marginBottom="300">
        <Text variant="title" style={{ flex: 1 }} numberOfLines={2}>
          {event.title}
        </Text>
        <StatusPill status={event.status} />
      </Box>

      <MetaRow icon="map-pin" text={event.venue} />
      <MetaRow icon="calendar" text={formatEventDate(event.eventDate)} />
      <MetaRow icon="clock" text={formatTimeRange(event.startTime, event.endTime)} />

      <Box
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        marginTop="300"
        paddingTop="300"
        borderTopWidth={1}
        borderTopColor="borderDefault"
      >
        <Box flexDirection="row" alignItems="center" gap="150">
          <Text variant="label" color="inkBody">
            {event.headcount}
          </Text>
          <Text variant="bodySm" color="inkMuted">
            {event.headcount === 1 ? 'staff' : 'staff'} needed
          </Text>
        </Box>
        <Text variant="label" color="brandEmerald">
          {formatNaira(kobo(event.budgetPerHead))}/head
        </Text>
      </Box>
    </Card>
  );
}
