import { EmptyState } from '../../components/EmptyState.js';
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
import { fonts } from '../../theme/fonts.js';
import { Chip } from '../../components/Chip.js';
import { StaffCard } from '../../components/StaffCard.js';
import { Icon } from '../../components/Icon.js';
import { SkeletonRow } from '../../components/Skeleton.js';
import { useUshers } from '../../lib/hooks.js';
import { useDebouncedValue } from '../../lib/use-debounced-value.js';
import {
  useDiscoverFilters,
  setDiscoverFilters,
  toUsherQuery,
  activeFilterCount,
  todayIso,
} from '../../lib/discover-filters.js';
import { money } from '../../lib/format.js';
import type { UsherListItem } from '../../lib/types.js';

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
      meta={`${usher.ratingAvg.toFixed(1)} · ${usher.completedJobsCount} jobs · ${usher.city ?? 'Lagos'}`}
      price={usher.dayRateKobo ? money(usher.dayRateKobo) : 'Rate on request'}
      priceSuffix={usher.dayRateKobo ? '/day' : ''}
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
  const filters = useDiscoverFilters();
  // Defer the network query so we fire one request per pause, not per keystroke.
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const ushers = useUshers({ query: debouncedQuery || undefined, ...toUsherQuery(filters) });
  const data = ushers.data ?? [];
  const filterCount = activeFilterCount(filters);

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
        style={{
          height: 48,
          paddingHorizontal: 16,
          gap: 8,
          borderWidth: 1.5,
          borderColor: theme.colors.borderDefault,
        }}
      >
        <Icon name="search" size={18} color="inkFaint" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search ushers, roles…"
          placeholderTextColor={theme.colors.inkFaint}
          style={{
            flex: 1,
            fontFamily: fonts.sansRegular,
            fontSize: 15,
            color: theme.colors.inkStrong,
            paddingVertical: 0,
          }}
        />
        <Pressable
          onPress={() => router.push('/(modals)/filters')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={filterCount > 0 ? `Filters, ${filterCount} applied` : 'Filters'}
        >
          <Box>
            <Icon name="sliders" size={18} color={filterCount > 0 ? 'brandEmerald' : 'inkMuted'} />
            {filterCount > 0 ? (
              <Box
                style={{
                  position: 'absolute',
                  top: -7,
                  right: -9,
                  minWidth: 16,
                  height: 16,
                  borderRadius: 8,
                  paddingHorizontal: 4,
                  backgroundColor: theme.colors.brandSurface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontFamily: fonts.sansBold,
                    fontSize: 10,
                    lineHeight: 12,
                    color: theme.colors.inverseInk,
                  }}
                >
                  {filterCount}
                </Text>
              </Box>
            ) : null}
          </Box>
        </Pressable>
      </Box>

      {/* applied / quick filters — reflect the shared discover-filter store */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
        style={{ marginHorizontal: -20 }}
        contentInset={{ left: 20, right: 20 }}
      >
        <Box style={{ width: 20 }} />
        {filters.availableOn ? (
          <Chip
            label="Today ✕"
            selected
            onPress={() => setDiscoverFilters({ ...filters, availableOn: undefined })}
          />
        ) : (
          <Chip
            label="Available today"
            onPress={() => setDiscoverFilters({ ...filters, availableOn: todayIso() })}
          />
        )}
        {filters.minRating ? (
          <Chip
            label={`${filters.minRating}★+ ✕`}
            selected
            onPress={() => setDiscoverFilters({ ...filters, minRating: undefined })}
          />
        ) : (
          <Chip label="4★+" onPress={() => setDiscoverFilters({ ...filters, minRating: 4 })} />
        )}
        {filters.location ? (
          <Chip
            label={`${filters.location} ✕`}
            selected
            onPress={() => setDiscoverFilters({ ...filters, location: undefined })}
          />
        ) : null}
        {filters.maxRate ? (
          <Chip
            label={`≤ ${money(filters.maxRate)} ✕`}
            selected
            onPress={() => setDiscoverFilters({ ...filters, maxRate: undefined })}
          />
        ) : null}
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
        ListHeaderComponent={
          <>
            {header}
            {ushers.isError && data.length > 0 ? (
              <EmptyState
                icon="alert-circle"
                title="Results may be out of date"
                actionLabel="Refresh results"
                onAction={() => {
                  void ushers.refetch();
                }}
              />
            ) : null}
          </>
        }
        ItemSeparatorComponent={Separator}
        refreshControl={
          <RefreshControl
            refreshing={ushers.isFetching}
            onRefresh={() => {
              void ushers.refetch();
            }}
          />
        }
        ListEmptyComponent={
          ushers.isLoading ? (
            <Box style={{ gap: 12 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </Box>
          ) : ushers.isError ? (
            <EmptyState
              icon="alert-circle"
              title="Couldn’t load ushers"
              actionLabel="Try again"
              onAction={() => {
                void ushers.refetch();
              }}
            />
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
