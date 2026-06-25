/**
 * View Profile — matches Figma `Client / 12 View Profile` (28:269). Live: usher
 * profile from `useUsher` and received reviews from `useUsherReviews`. Inviting
 * happens from an event (the API needs an event context), so the action bar
 * points the client back to their events.
 */
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { AppBar } from '../../components/AppBar.js';
import { Avatar } from '../../components/Avatar.js';
import { Badge } from '../../components/Badge.js';
import { Button } from '../../components/Button.js';
import { Icon } from '../../components/Icon.js';
import { ReviewCard } from '../../components/ReviewCard.js';
import { SectionHeader } from '../../components/SectionHeader.js';
import { Loading } from '../../components/Loading.js';
import { useUsher, useUsherReviews } from '../../lib/hooks.js';
import { useToast } from '../../lib/toast.js';
import { shortDate } from '../../lib/format.js';

function Pill({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <Box style={{ backgroundColor: theme.colors.bgSubtle, paddingHorizontal: 12, paddingVertical: 6, borderRadius: theme.borderRadii.pill }}>
      <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, lineHeight: 16, letterSpacing: 0.2 }} color="inkDefault">
        {label}
      </Text>
    </Box>
  );
}

/** Average + per-star distribution bars (Urban Company pattern), computed from the loaded reviews. */
function RatingBreakdown({ ratings, avg }: { ratings: number[]; avg: number }) {
  const theme = useTheme();
  const total = ratings.length;
  const rows = [5, 4, 3, 2, 1].map((star) => ({ star, n: ratings.filter((r) => Math.round(r) === star).length }));
  return (
    <Box
      flexDirection="row"
      backgroundColor="bgSurface"
      borderWidth={1}
      borderColor="borderDefault"
      borderRadius="lg"
      padding="400"
      style={{ gap: 16 }}
    >
      <Box alignItems="center" justifyContent="center" style={{ gap: 4, minWidth: 64 }}>
        <Text variant="display" color="inkStrong">{avg.toFixed(1)}</Text>
        <Box flexDirection="row" style={{ gap: 2 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Icon key={i} name="star" size={12} color={i <= Math.round(avg) ? 'accentGold' : 'borderStrong'} />
          ))}
        </Box>
        <Text variant="bodySm" color="inkMuted">{total} review{total === 1 ? '' : 's'}</Text>
      </Box>
      <Box flex={1} justifyContent="center" style={{ gap: 6 }}>
        {rows.map(({ star, n }) => (
          <Box key={star} flexDirection="row" alignItems="center" style={{ gap: 8 }}>
            <Text variant="labelSm" color="inkMuted" style={{ width: 8 }}>{star}</Text>
            <Box flex={1} style={{ height: 6, borderRadius: 999, backgroundColor: theme.colors.bgInset, overflow: 'hidden' }}>
              <Box style={{ height: 6, borderRadius: 999, width: `${total ? (n / total) * 100 : 0}%`, backgroundColor: theme.colors.accentGold }} />
            </Box>
            <Text variant="labelSm" color="inkMuted" style={{ width: 18, textAlign: 'right' }}>{n}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** Paged, snap-scrolling work-photo carousel with index dots (replaces the free-scroll gallery). */
function PortfolioCarousel({ photos }: { photos: { id: string; imageUrl: string }[] }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  return (
    <Box style={{ gap: 10 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          if (width > 0) setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
        }}
      >
        {photos.map((p) => (
          <Image
            key={p.id}
            source={{ uri: p.imageUrl }}
            style={{ width, height: 240, borderRadius: theme.borderRadii.lg, backgroundColor: theme.colors.bgSubtle }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
            recyclingKey={p.id}
          />
        ))}
      </ScrollView>
      {photos.length > 1 ? (
        <Box flexDirection="row" justifyContent="center" style={{ gap: 6 }}>
          {photos.map((p, i) => (
            <Box
              key={p.id}
              style={{
                width: i === index ? 18 : 6,
                height: 6,
                borderRadius: 999,
                backgroundColor: i === index ? theme.colors.brandEmerald : theme.colors.bgInset,
              }}
            />
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

export default function StaffProfile(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const usher = useUsher(id ?? '');
  const reviews = useUsherReviews(id ?? '');
  const toast = useToast();

  const invite = (): void => {
    toast.info('Open one of your events to invite this usher.', 'Invite to an event');
    router.back();
  };

  if (usher.isLoading || !usher.data) {
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar showBack inset />
        <Loading />
      </Box>
    );
  }

  const u = usher.data;
  const name = u.displayName ?? 'Usher';

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar showBack inset />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, gap: 24 }} showsVerticalScrollIndicator={false}>
        {/* identity */}
        <Box alignItems="center" style={{ gap: 12 }}>
          <Avatar name={name} size={96} imageUrl={u.avatarUrl} />
          <Box flexDirection="row" alignItems="center" style={{ gap: 8 }}>
            <Text variant="h1">{name}</Text>
            {u.verificationStatus === 'VERIFIED' ? <Badge /> : null}
          </Box>
          <Box flexDirection="row" alignItems="center" style={{ gap: 6 }}>
            <Icon name="star" size={16} color="accentGold" />
            <Text variant="label" style={{ fontSize: 15 }} color="inkStrong">
              {u.ratingAvg.toFixed(1)}
            </Text>
            <Text variant="bodyLg" color="inkFaint">·</Text>
            <Text variant="bodyLg" color="inkMuted">{u.completedJobsCount} jobs</Text>
            <Text variant="bodyLg" color="inkFaint">·</Text>
            <Text variant="label" style={{ fontSize: 13 }} color="statusSuccess">
              {Math.round(u.reliabilityScore)}% reliable
            </Text>
          </Box>
        </Box>

        {/* about */}
        {u.bio ? (
          <Box style={{ gap: 8 }}>
            <Text variant="headingS">About</Text>
            <Text variant="body" color="inkDefault">{u.bio}</Text>
          </Box>
        ) : null}

        {/* portfolio — work photos the usher uploaded (paged carousel + dots) */}
        {(u.portfolio ?? []).length > 0 ? (
          <Box style={{ gap: 8 }}>
            <Text variant="headingS">Work photos</Text>
            <PortfolioCarousel photos={u.portfolio ?? []} />
          </Box>
        ) : null}

        {/* experience */}
        <Box style={{ gap: 8 }}>
          <Text variant="labelSm" color="inkMuted">Experience</Text>
          <Box flexDirection="row">
            <Pill label={`${u.yearsExperience} year${u.yearsExperience === 1 ? '' : 's'}`} />
          </Box>
        </Box>

        {/* reviews */}
        <Box style={{ gap: 12 }}>
          <SectionHeader title="Reviews" />
          {(reviews.data ?? []).length === 0 ? (
            <Text variant="bodySm" color="inkMuted">No reviews yet.</Text>
          ) : (
            <>
              <RatingBreakdown ratings={(reviews.data ?? []).map((r) => r.rating)} avg={u.ratingAvg} />
              {(reviews.data ?? []).map((rv) => (
                <ReviewCard key={rv.id} name={rv.reviewerName} date={shortDate(rv.createdAt)} comment={rv.comment ?? ''} rating={rv.rating} />
              ))}
            </>
          )}
        </Box>
      </ScrollView>

      {/* action bar */}
      <Box flexDirection="row" backgroundColor="bgCanvas" style={{ gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 16, borderTopWidth: 1.5, borderTopColor: theme.colors.borderDefault }}>
        <Box flex={1}>
          <Button label="Message" variant="secondary" onPress={() => router.back()} />
        </Box>
        <Box flex={1}>
          <Button label="Invite" onPress={invite} />
        </Box>
      </Box>
    </Box>
  );
}
