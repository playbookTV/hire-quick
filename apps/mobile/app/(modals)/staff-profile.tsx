/** Figma E01 staff profile; live identity, portfolio, reviews and booking-scoped messaging. */
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { fonts } from '../../theme/fonts.js';
import { AppBar } from '../../components/AppBar.js';
import { Avatar } from '../../components/Avatar.js';
import { StatusPill } from '../../components/StatusPill.js';
import { Card } from '../../components/Card.js';
import { screenTokens } from '../../theme/token-manager.js';
import { Button } from '../../components/Button.js';
import { Icon } from '../../components/Icon.js';
import { ReviewCard } from '../../components/ReviewCard.js';
import { SectionHeader } from '../../components/SectionHeader.js';
import { Loading } from '../../components/Loading.js';
import { EmptyState } from '../../components/EmptyState.js';
import { useUsher, useUsherReviews, useBookings } from '../../lib/hooks.js';
import { useToast } from '../../lib/toast.js';
import { shortDate, money } from '../../lib/format.js';

function Pill({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <Box
      style={{
        backgroundColor: theme.colors.bgSubtle,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: theme.borderRadii.pill,
      }}
    >
      <Text
        style={{ fontFamily: fonts.sansSemibold, fontSize: 13, lineHeight: 16, letterSpacing: 0.2 }}
        color="inkDefault"
      >
        {label}
      </Text>
    </Box>
  );
}

/** Average + per-star distribution bars (Urban Company pattern), computed from the loaded reviews. */
function RatingBreakdown({ ratings, avg }: { ratings: number[]; avg: number }) {
  const theme = useTheme();
  const total = ratings.length;
  const rows = [5, 4, 3, 2, 1].map((star) => ({
    star,
    n: ratings.filter((r) => Math.round(r) === star).length,
  }));
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
        <Text variant="display" color="inkStrong">
          {avg.toFixed(1)}
        </Text>
        <Box flexDirection="row" style={{ gap: 2 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Icon
              key={i}
              name="star"
              size={12}
              color={i <= Math.round(avg) ? 'accentGold' : 'borderStrong'}
            />
          ))}
        </Box>
        <Text variant="bodySm" color="inkMuted">
          {total} review{total === 1 ? '' : 's'}
        </Text>
      </Box>
      <Box flex={1} justifyContent="center" style={{ gap: 6 }}>
        {rows.map(({ star, n }) => (
          <Box key={star} flexDirection="row" alignItems="center" style={{ gap: 8 }}>
            <Text variant="labelSm" color="inkMuted" style={{ width: 8 }}>
              {star}
            </Text>
            <Box
              flex={1}
              style={{
                height: 6,
                borderRadius: 999,
                backgroundColor: theme.colors.bgInset,
                overflow: 'hidden',
              }}
            >
              <Box
                style={{
                  height: 6,
                  borderRadius: 999,
                  width: `${total ? (n / total) * 100 : 0}%`,
                  backgroundColor: theme.colors.accentGold,
                }}
              />
            </Box>
            <Text variant="labelSm" color="inkMuted" style={{ width: 18, textAlign: 'right' }}>
              {n}
            </Text>
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
            style={{
              width,
              height: 240,
              borderRadius: theme.borderRadii.lg,
              backgroundColor: theme.colors.bgSubtle,
            }}
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
  const bookings = useBookings();
  const toast = useToast();

  const invite = (): void => {
    router.push({ pathname: '/(modals)/invite-staff', params: { usher: id } });
  };

  if (usher.isLoading) {
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar showBack inset />
        <Loading />
      </Box>
    );
  }
  if (usher.isError || !usher.data) {
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar showBack inset />
        <Box style={{ paddingTop: 40 }}>
          <EmptyState
            icon="alert-circle"
            title="Couldn’t load this profile"
            subtitle="Check your connection and try again."
            actionLabel="Try again"
            onAction={() => {
              void usher.refetch();
            }}
          />
        </Box>
      </Box>
    );
  }

  const u = usher.data;
  const name = u.displayName ?? 'Usher';

  // Chat is booking-scoped (rooms are `booking:<id>`; there is no DM without a
  // booking — the API even flags messages that leak contact details). So
  // "Message" opens the most recent thread we already share with this usher; if
  // none exists yet, nudge the client to invite them (a thread exists once a
  // booking does).
  const existingThread = (bookings.data ?? []).find(
    (b) =>
      b.usherId === (id ?? '') &&
      [
        'CONFIRMED',
        'CHECKED_IN',
        'COMPLETED',
        'PAID',
        'DISPUTED',
        'CANCELLED',
        'REFUNDED',
        'NO_SHOW',
      ].includes(b.status),
  );
  const message = (): void => {
    if (existingThread) {
      router.push({ pathname: '/(modals)/message-thread', params: { booking: existingThread.id } });
      return;
    }
    toast.info(
      `You can message ${name} once their booking is confirmed by payment.`,
      'No booking yet',
    );
  };

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar showBack inset />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: screenTokens.gutter,
          paddingTop: screenTokens.top,
          paddingBottom: screenTokens.bottom,
          gap: screenTokens.sectionGap,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Box flexDirection="row" alignItems="center" gap="300">
          <Avatar name={name} size={96} imageUrl={u.avatarUrl} />
          <Box flex={1} gap="100">
            <Text variant="headingM">{name}</Text>
            {u.verificationStatus === 'VERIFIED' ? <StatusPill status="VERIFIED" /> : null}
            {u.city ? (
              <Text variant="bodySm" color="inkMuted">
                {u.city}
              </Text>
            ) : null}
          </Box>
        </Box>
        <Card>
          <Box flexDirection="row" flexWrap="wrap" justifyContent="space-around" gap="200">
            {[
              [u.ratingAvg.toFixed(1), 'Rating'],
              [String(u.completedJobsCount), 'Jobs'],
              [`${u.yearsExperience} yrs`, 'Experience'],
            ].map(([value, label]) => (
              <Box key={label} alignItems="center" gap="100">
                <Text variant="amount">{value}</Text>
                <Text variant="bodySm" color="inkMuted">
                  {label}
                </Text>
              </Box>
            ))}
          </Box>
        </Card>

        {/* about */}
        {u.bio ? (
          <Box style={{ gap: 8 }}>
            <Text variant="headingS">About</Text>
            <Text variant="body" color="inkDefault">
              {u.bio}
            </Text>
          </Box>
        ) : null}

        <Box gap="200">
          <Text variant="headingS" color="inkMuted">
            Work photos
          </Text>
          {(u.portfolio ?? []).length > 0 ? (
            <PortfolioCarousel photos={u.portfolio ?? []} />
          ) : (
            <Box backgroundColor="bgSubtle" borderRadius="md" padding="400">
              <Text variant="bodySm" color="inkMuted">
                No work photos added yet.
              </Text>
            </Box>
          )}
        </Box>
        <Card>
          <Box gap="200">
            <Box flexDirection="row" flexWrap="wrap" justifyContent="space-between" gap="200">
              <Text variant="labelLg">Indicative day rate</Text>
              <Text variant="amountM">{u.dayRateKobo ? money(u.dayRateKobo) : 'On request'}</Text>
            </Box>
            <Text variant="bodySm" color="inkMuted">
              The event’s agreed budget sets the actual price for a booking.
            </Text>
          </Box>
        </Card>

        {/* languages */}
        {(u.languages ?? []).length > 0 ? (
          <Box style={{ gap: 8 }}>
            <Text variant="labelSm" color="inkMuted">
              Languages
            </Text>
            <Box flexDirection="row" flexWrap="wrap" style={{ gap: 8 }}>
              {(u.languages ?? []).map((lang) => (
                <Pill key={lang} label={lang} />
              ))}
            </Box>
          </Box>
        ) : null}

        {/* reviews */}
        <Box style={{ gap: 12 }}>
          <SectionHeader title="Reviews" />
          {(reviews.data ?? []).length === 0 ? (
            <Text variant="bodySm" color="inkMuted">
              No reviews yet.
            </Text>
          ) : (
            <>
              <RatingBreakdown
                ratings={(reviews.data ?? []).map((r) => r.rating)}
                avg={u.ratingAvg}
              />
              {(reviews.data ?? []).map((rv) => (
                <ReviewCard
                  key={rv.id}
                  name={rv.reviewerName}
                  date={shortDate(rv.createdAt)}
                  comment={rv.comment ?? ''}
                  rating={rv.rating}
                />
              ))}
            </>
          )}
        </Box>
      </ScrollView>

      {/* action bar */}
      <Box
        backgroundColor="bgCanvas"
        style={{
          gap: 12,
          paddingHorizontal: screenTokens.gutter,
          paddingTop: 16,
          paddingBottom: insets.bottom + 16,
          borderTopWidth: 1.5,
          borderTopColor: theme.colors.borderDefault,
        }}
      >
        <Button label="Invite to an event" onPress={invite} />
        {existingThread ? (
          <Button label="Message" variant="secondary" onPress={message} />
        ) : (
          <Text variant="bodySm" color="inkMuted">
            Messaging opens once you have a confirmed booking together.
          </Text>
        )}
      </Box>
    </Box>
  );
}
