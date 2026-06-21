/**
 * Browse Jobs — matches Figma `Usher / 02 Browse Jobs` (45:86): title + count,
 * filter chips, and a JobCard list. Stub jobs until the usher jobs feed is wired;
 * tapping a card opens the job details.
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Text } from '../../theme/restyle.js';
import { Chip } from '../../components/Chip.js';
import { JobCard } from '../../components/JobCard.js';
import { EmptyState } from '../../components/EmptyState.js';

const FILTERS = ['This week', '< 10 km', '₦12k+'];
const JOBS = [
  { title: 'Adeola’s Wedding', pay: '₦15,000', date: 'Sat 12 Jul', distance: 'Ikoyi · 4km', dress: 'Black tie', rating: '4.8' },
  { title: 'Corporate Gala', pay: '₦16,000', date: 'Fri 18 Jul', distance: 'VI · 7km', dress: 'Formal', rating: '4.9' },
  { title: 'Brand Launch', pay: '₦13,500', date: 'Sun 20 Jul', distance: 'Lekki · 9km', dress: 'Smart casual', rating: '4.6' },
];

export default function Jobs(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState<Record<string, boolean>>({ 'This week': true });

  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 16 }} showsVerticalScrollIndicator={false}>
        <Box style={{ gap: 4 }}>
          <Text variant="h2">Find work</Text>
          <Text variant="bodySm" color="inkMuted">
            12 jobs near you in Lagos
          </Text>
        </Box>

        <Box flexDirection="row" style={{ gap: 8 }}>
          {FILTERS.map((f) => (
            <Chip key={f} label={f} selected={!!active[f]} onPress={() => setActive((s) => ({ ...s, [f]: !s[f] }))} />
          ))}
        </Box>

        {JOBS.length === 0 ? (
          <Box style={{ paddingTop: 48 }}>
            <EmptyState
              icon="search"
              title="No jobs match your filters"
              subtitle="Try widening your distance or dates — new jobs are posted across Lagos every day."
              actionLabel="Adjust filters"
              onAction={() => setActive({})}
            />
          </Box>
        ) : (
          <Box style={{ gap: 12 }}>
            {JOBS.map((j) => (
              <JobCard
                key={j.title}
                title={j.title}
                pay={j.pay}
                date={j.date}
                distance={j.distance}
                dress={j.dress}
                rating={j.rating}
                onAction={() => router.push('/(modals)/event-details')}
                onPress={() => router.push('/(modals)/event-details')}
              />
            ))}
          </Box>
        )}
      </ScrollView>
    </Box>
  );
}
