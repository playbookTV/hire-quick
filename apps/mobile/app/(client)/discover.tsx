/**
 * Discover — matches Figma `Client / 10 Discover` (27:214): title + subtitle, a
 * search field with a filter affordance, filter chips, and a list of StaffCards.
 * Live: verified ushers from `useUshers`, filtered by the (debounced) search
 * text. Tapping a card opens that usher's profile.
 *
 * The list is a FlashList (virtualized) with the header block as
 * `ListHeaderComponent`, so only on-screen cards mount — the feed scrolls and
 * filters without rendering every usher at once.
 */
import { memo, useCallback, useState } from 'react';
import { Pressable, ScrollView, TextInput, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { Chip } from '../../components/Chip.js';
import { StaffCard } from '../../components/StaffCard.js';
import { Icon } from '../../components/Icon.js';
import { SkeletonRow } from '../../components/Skeleton.js';
import { useUshers } from '../../lib/hooks.js';
import { useDebouncedValue } from '../../lib/use-debounced-value.js';
import type { UsherListItem } from '../../lib/types.js';

const FILTERS = ['Available today', 'Ikoyi', '4★+'];

/** 12px gap between cards (FlashList doesn't honour `gap` in contentContainerStyle). */
function Separator(): React.JSX.Element {
  return <Box style={{ height: 12 }} />;
}

/**
 * Memoized row: builds its own meta string and press handler from a stable
 * `usher` (React Query keeps the array ref between keystroke re-renders) and a
 * stable `onOpen`, so typing in the search box doesn't re-render the cards.
 */
const StaffRow = memo(function StaffRow({
  usher,
  onOpen,
}: {
  readonly usher: UsherListItem;
  readonly onOpen: (id: string) => void;
}): React.JSX.Element {
  return (
    <StaffCard
      name={usher.displayName ?? 'Usher'}
      avatarUrl={usher.avatarUrl}
      meta={`${usher.ratingAvg.toFixed(1)} · ${usher.completedJobsCount} jobs · ${usher.yearsExperience}y exp`}
      price={usher.verificationStatus === 'VERIFIED' ? 'Verified' : ''}
      verified={usher.verificationStatus === 'VERIFIED'}
      onPress={() => onOpen(usher.id)}
    />
  );
});

export default function Discover(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<Record<string, boolean>>({ 'Available today': true });
  // Defer the network query so we fire one request per pause, not per keystroke.
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const ushers = useUshers({ query: debouncedQuery || undefined, minRating: active['4★+'] ? 4 : undefined });
  const data = ushers.data ?? [];

  const onOpen = useCallback(
    (id: string) => router.push({ pathname: '/(modals)/staff-profile', params: { id } }),
    [router],
  );
  const renderItem = useCallback(
    ({ item }: { item: UsherListItem }) => <StaffRow usher={item} onOpen={onOpen} />,
    [onOpen],
  );

  const header = (
    <Box style={{ gap: 16, paddingBottom: 16 }}>
      <Box style={{ gap: 4 }}>
        <Text variant="h2">Discover staff</Text>
        <Text variant="bodySm" color="inkMuted">
          Verified ushers available in Lagos
        </Text>
      </Box>

      {/* search */}
      <Box
        flexDirection="row"
        alignItems="center"
        backgroundColor="bgSurface"
        borderRadius="md"
        style={{ height: 48, paddingHorizontal: 16, gap: 8, borderWidth: 1.5, borderColor: theme.colors.borderDefault }}
      >
        <Icon name="search" size={18} color="inkFaint" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search ushers, roles…"
          placeholderTextColor={theme.colors.inkFaint}
          style={{ flex: 1, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 15, color: theme.colors.inkStrong, paddingVertical: 0 }}
        />
        <Pressable onPress={() => router.push('/(modals)/filters')} hitSlop={8}>
          <Icon name="sliders" size={18} color="inkMuted" />
        </Pressable>
      </Box>

      {/* filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
        style={{ marginHorizontal: -20 }}
        contentInset={{ left: 20, right: 20 }}
      >
        <Box style={{ width: 20 }} />
        {FILTERS.map((f) => (
          <Chip key={f} label={f} selected={!!active[f]} onPress={() => setActive((s) => ({ ...s, [f]: !s[f] }))} />
        ))}
        <Box style={{ width: 20 }} />
      </ScrollView>
    </Box>
  );

  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      <FlashList
        data={data}
        keyExtractor={(u) => u.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ItemSeparatorComponent={Separator}
        refreshControl={<RefreshControl refreshing={ushers.isFetching} onRefresh={() => { void ushers.refetch(); }} />}
        ListEmptyComponent={
          ushers.isLoading ? (
            <Box style={{ gap: 12 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </Box>
          ) : (
            <Text variant="bodySm" color="inkMuted">
              No ushers match your search yet.
            </Text>
          )
        }
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />
    </Box>
  );
}
