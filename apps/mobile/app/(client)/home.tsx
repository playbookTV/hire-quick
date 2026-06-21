/**
 * Client home — greeting, quick actions, and a peek at your events (live from
 * GET /api/events). Empty state nudges first-time clients into Create Event.
 */
import { useRouter } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { QuickActionCard } from '../../components/QuickActionCard.js';
import { SectionHeader } from '../../components/SectionHeader.js';
import { EventCard } from '../../components/EventCard.js';
import { EmptyState } from '../../components/EmptyState.js';
import { Button } from '../../components/Button.js';
import { Box, Text, useTheme } from '../../theme/restyle.js';
import { useAuth } from '../../lib/auth-context.js';
import { useEvents } from '../../lib/hooks.js';

export default function ClientHome(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const { user } = useAuth();
  const events = useEvents();

  const name = user?.client?.displayName && user.client.displayName !== user.phone ? user.client.displayName : null;
  const recent = (events.data ?? []).slice(0, 3);

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Home" inset />
      <Screen scroll>
        <Text variant="h1">{name ? `Hi, ${name.split(' ')[0]} 👋` : 'Welcome 👋'}</Text>
        <Text variant="body" color="inkMuted" marginTop="150" marginBottom="500">
          Book trusted event staff in minutes.
        </Text>

        <Box flexDirection="row" gap="300" marginBottom="600">
          <QuickActionCard
            title="Create event"
            icon="plus"
            variant="primary"
            onPress={() => router.push('/(modals)/create-event')}
          />
          <QuickActionCard
            title="Find staff"
            icon="search"
            onPress={() => router.push('/(client)/discover')}
          />
        </Box>

        <SectionHeader
          title="Your events"
          actionLabel={recent.length ? 'See all' : undefined}
          onAction={recent.length ? () => router.push('/(client)/events') : undefined}
        />

        {events.isLoading ? (
          <Box paddingVertical="800" alignItems="center">
            <ActivityIndicator color={theme.colors.brandEmerald} />
          </Box>
        ) : recent.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="No events yet"
            subtitle="Create your first event and we’ll help you staff it."
            actionLabel="Create event"
            onAction={() => router.push('/(modals)/create-event')}
          />
        ) : (
          <Box gap="300">
            {recent.map((e) => (
              <EventCard key={e.id} event={e} onPress={() => router.push(`/(client)/events/${e.id}`)} />
            ))}
            {events.data && events.data.length > 3 ? (
              <Button label="See all events" variant="ghost" onPress={() => router.push('/(client)/events')} />
            ) : null}
          </Box>
        )}
      </Screen>
    </Box>
  );
}
