import { EmptyState } from '../../components/EmptyState.js';
import { memo, useCallback, useState } from 'react';
import { Pressable, TextInput, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { fonts } from '../../theme/fonts.js';
import { ScreenHeading } from '../../components/ScreenHeading.js';
import { screenTokens } from '../../theme/token-manager.js';
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
  return <Box style={{ height: 16 }} />;
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
      priceSuffix={usher.dayRateKobo ? '/ day indicative' : ''}
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
      <ScreenHeading title="Find your team" />

      {/* search */}
      <Box
        flexDirection="row"
        alignItems="center"
        backgroundColor="bgSurface"
        borderRadius="md"
        style={{
          minHeight: 48,
          paddingHorizontal: 12,
          gap: 8,
          borderWidth: 1.5,
          borderColor: theme.colors.borderControl,
        }}
      >
        <Icon name="search" size={18} color="inkFaint" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search ushers"
          accessibilityLabel="Search ushers"
          placeholderTextColor={theme.colors.inkFaint}
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: fonts.sansRegular,
            fontSize: 16,
            color: theme.colors.inkStrong,
            paddingVertical: 12,
          }}
        />
        <Pressable
          onPress={() =>
            router.push({ pathname: '/(modals)/filters', params: { query: query.trim() } })
          }
          style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
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

      <Box flexDirection="row" flexWrap="wrap" gap="200">
        <Chip
          label="Available today"
          selected={!!filters.availableOn}
          onPress={() =>
            setDiscoverFilters({
              ...filters,
              availableOn: filters.availableOn ? undefined : todayIso(),
            })
          }
        />
        <Chip
          label={filters.location ?? 'Lagos'}
          selected={!!filters.location}
          onPress={() =>
            setDiscoverFilters({ ...filters, location: filters.location ? undefined : 'Lagos' })
          }
        />
        <Chip
          label={`${filters.minRating ?? 4.5}+`}
          selected={!!filters.minRating}
          onPress={() =>
            setDiscoverFilters({ ...filters, minRating: filters.minRating ? undefined : 4.5 })
          }
        />
        {filters.maxRate ? (
          <Chip
            label={`≤ ${money(filters.maxRate)}`}
            selected
            onPress={() => setDiscoverFilters({ ...filters, maxRate: undefined })}
          />
        ) : null}
      </Box>
      <Box flexDirection="row" alignItems="center" justifyContent="space-between" gap="200">
        <Text variant="bodySm" color="inkMuted">
          {ushers.isLoading
            ? 'Finding ushers…'
            : ushers.isError
              ? 'Results unavailable'
              : `${data.length} verified usher${data.length === 1 ? '' : 's'}`}
        </Text>
        <Pressable
          onPress={() =>
            router.push({ pathname: '/(modals)/filters', params: { query: query.trim() } })
          }
          accessibilityRole="button"
          accessibilityLabel="Open discovery filters"
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text variant="label">
            {filterCount ? `${filterCount} filter${filterCount === 1 ? '' : 's'}` : 'Filters'}
          </Text>
        </Pressable>
      </Box>
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
            <EmptyState
              icon="search"
              title={query.trim() || filterCount ? 'No matching ushers' : 'No ushers available yet'}
              subtitle={
                query.trim() || filterCount
                  ? 'Try a different search or loosen your filters.'
                  : 'Verified ushers will appear here when they become available.'
              }
              actionLabel={
                query.trim() ? 'Clear search' : filterCount ? 'Reset filters' : undefined
              }
              onAction={() => (query.trim() ? setQuery('') : setDiscoverFilters({}))}
              secondaryLabel={query.trim() && filterCount ? 'Reset filters' : undefined}
              onSecondary={() => setDiscoverFilters({})}
            />
          )
        }
        contentContainerStyle={{
          paddingHorizontal: screenTokens.gutter,
          paddingTop: screenTokens.top,
          paddingBottom: screenTokens.bottom,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />
    </Box>
  );
}
