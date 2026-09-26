/**
 * Filters — matches Figma `Client / 11 Filters` (41:506): chip groups
 * (Availability / Location / Min rating / Max rate), then Reset / Show-results.
 *
 * Live: edits a local draft, queries `useUshers` against it to show the real
 * result count on the button, and commits the draft to the shared discover-filter
 * store on "Show results" so the Discover feed re-queries. Discovery is always
 * verified-only for clients (PRD §8), so there is no "verified" toggle — instead a
 * static note states it.
 */
import { useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Chip } from '../../components/Chip.js';
import { Banner } from '../../components/Banner.js';
import { Button } from '../../components/Button.js';
import { useUshers } from '../../lib/hooks.js';
import {
  type DiscoverFilters,
  getDiscoverFilters,
  setDiscoverFilters,
  toUsherQuery,
  todayIso,
} from '../../lib/discover-filters.js';

const LOCATIONS = ['Ikoyi', 'Lekki', 'Victoria Island', 'Mainland'];
const RATE_CEILINGS: { label: string; kobo: number }[] = [
  { label: '≤ ₦20k', kobo: 2_000_000 },
  { label: '≤ ₦35k', kobo: 3_500_000 },
  { label: '≤ ₦50k', kobo: 5_000_000 },
];

export default function Filters(): React.JSX.Element {
  const router = useRouter();
  const { query = '' } = useLocalSearchParams<{ query?: string }>();
  const insets = useSafeAreaInsets();
  // Draft starts from whatever the feed currently has applied.
  const [draft, setDraft] = useState<DiscoverFilters>(() => getDiscoverFilters());

  // Live count against the draft so "Show results" reflects reality, not a guess.
  const preview = useUshers(
    useMemo(() => ({ ...toUsherQuery(draft), query: query.trim() || undefined }), [draft, query]),
  );
  const count = preview.data?.length ?? 0;

  const patch = (p: Partial<DiscoverFilters>): void => setDraft((d) => ({ ...d, ...p }));

  const noun = count === 1 ? 'result' : 'results';
  const buttonLabel =
    preview.isFetching || preview.isError || !preview.data
      ? 'Apply filters'
      : `Show ${count} ${noun}`;

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Filters" showBack inset />
      <Screen scroll>
        <Box style={{ gap: 24 }}>
          {/* availability */}
          <Box style={{ gap: 12 }}>
            <Text variant="headingS">Availability</Text>
            <Box flexDirection="row" flexWrap="wrap" style={{ gap: 8 }}>
              <Chip
                label="Any time"
                selected={!draft.availableOn}
                onPress={() => patch({ availableOn: undefined })}
              />
              <Chip
                label="Available today"
                selected={!!draft.availableOn}
                onPress={() => patch({ availableOn: draft.availableOn ? undefined : todayIso() })}
              />
            </Box>
          </Box>

          {/* location */}
          <Box style={{ gap: 12 }}>
            <Text variant="headingS">Location</Text>
            <Box flexDirection="row" flexWrap="wrap" style={{ gap: 8 }}>
              <Chip
                label="Anywhere"
                selected={!draft.location}
                onPress={() => patch({ location: undefined })}
              />
              {LOCATIONS.map((loc) => (
                <Chip
                  key={loc}
                  label={loc}
                  selected={draft.location === loc}
                  onPress={() => patch({ location: draft.location === loc ? undefined : loc })}
                />
              ))}
            </Box>
          </Box>

          {/* min rating */}
          <Box style={{ gap: 12 }}>
            <Text variant="headingS">Minimum rating</Text>
            <Box flexDirection="row" flexWrap="wrap" style={{ gap: 8 }}>
              <Chip
                label="Any"
                selected={!draft.minRating}
                onPress={() => patch({ minRating: undefined })}
              />
              <Chip
                label="4★ +"
                selected={draft.minRating === 4}
                onPress={() => patch({ minRating: draft.minRating === 4 ? undefined : 4 })}
              />
              <Chip
                label="4.5★ +"
                selected={draft.minRating === 4.5}
                onPress={() => patch({ minRating: draft.minRating === 4.5 ? undefined : 4.5 })}
              />
            </Box>
          </Box>

          {/* max day rate */}
          <Box style={{ gap: 12 }}>
            <Text variant="headingS">Max day rate</Text>
            <Box flexDirection="row" flexWrap="wrap" style={{ gap: 8 }}>
              <Chip
                label="Any"
                selected={!draft.maxRate}
                onPress={() => patch({ maxRate: undefined })}
              />
              {RATE_CEILINGS.map((r) => (
                <Chip
                  key={r.kobo}
                  label={r.label}
                  selected={draft.maxRate === r.kobo}
                  onPress={() => patch({ maxRate: draft.maxRate === r.kobo ? undefined : r.kobo })}
                />
              ))}
            </Box>
            <Text variant="bodySm" color="inkFaint">
              Filters by the usher’s indicative rate. You always pay your event’s set budget.
            </Text>
          </Box>

          <Banner tone="info" message="Every usher you can discover is ID-verified." />
        </Box>

        <Box style={{ flex: 1, minHeight: 20 }} />
        {preview.isError ? (
          <Box style={{ gap: 8, marginBottom: 16 }}>
            <Banner
              tone="info"
              message="We couldn’t check the result count. You can still apply these filters."
            />
            <Button
              label="Retry result count"
              variant="ghost"
              onPress={() => {
                void preview.refetch();
              }}
            />
          </Box>
        ) : null}
        <Box flexDirection="row" style={{ gap: 12, paddingBottom: insets.bottom }}>
          <Box>
            <Button
              label="Reset"
              variant="secondary"
              fullWidth={false}
              onPress={() => setDraft({})}
            />
          </Box>
          <Box flex={1}>
            <Button
              label={buttonLabel}
              onPress={() => {
                setDiscoverFilters(draft);
                router.back();
              }}
            />
          </Box>
        </Box>
      </Screen>
    </Box>
  );
}
