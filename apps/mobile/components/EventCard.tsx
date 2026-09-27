/** Figma EventSummaryCard (2156:497), with server-confirmed staffing only. */
import { memo } from 'react';
import { Box, Text } from '../theme/restyle.js';
import { Card } from './Card.js';
import { StatusPill } from './StatusPill.js';
import { dateTime } from '../lib/format.js';
import type { EventResource } from '../lib/types.js';

export const EventCard = memo(function EventCard({
  event,
  onPress,
}: {
  event: EventResource;
  onPress?: () => void;
}): React.JSX.Element {
  const confirmed = event.staffing?.confirmed;
  const remaining = confirmed === undefined ? undefined : Math.max(0, event.headcount - confirmed);
  return (
    <Card onPress={onPress}>
      <Box gap="200">
        <Text variant="headingS">{event.title}</Text>
        <Text variant="bodySm" color="inkMuted">
          {dateTime(event.eventDate, event.startTime)}
        </Text>
        {confirmed !== undefined ? (
          <Box gap="150">
            <Box flexDirection="row" justifyContent="space-between" flexWrap="wrap" gap="100">
              <Text variant="label">
                {confirmed} of {event.headcount} confirmed
              </Text>
              <Text variant="bodySm" color="inkMuted">
                {remaining} to fill
              </Text>
            </Box>
            <Box
              height={6}
              backgroundColor="bgSubtle"
              borderRadius="pill"
              overflow="hidden"
              accessibilityRole="progressbar"
              accessibilityLabel="Confirmed staff"
              accessibilityValue={{ min: 0, max: event.headcount, now: confirmed }}
            >
              <Box
                height={6}
                backgroundColor="brandAccent"
                borderRadius="pill"
                style={{
                  width: `${event.headcount > 0 ? Math.min(100, (confirmed / event.headcount) * 100) : 0}%`,
                }}
              />
            </Box>
          </Box>
        ) : (
          <Text variant="bodySm" color="inkMuted">
            {event.headcount} staff needed
          </Text>
        )}
        <StatusPill
          status={event.status}
          label={event.status === 'OPEN' ? 'Recruiting' : undefined}
        />
      </Box>
    </Card>
  );
});
