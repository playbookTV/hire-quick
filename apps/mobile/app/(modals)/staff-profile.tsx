/**
 * View Profile — matches Figma `Client / 12 View Profile` (28:269). Live: usher
 * profile from `useUsher` and received reviews from `useUsherReviews`. Inviting
 * happens from an event (the API needs an event context), so the action bar
 * points the client back to their events.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, ScrollView } from 'react-native';
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

export default function StaffProfile(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const usher = useUsher(id ?? '');
  const reviews = useUsherReviews(id ?? '');

  const invite = (): void => {
    Alert.alert('Invite to an event', 'Open one of your events to invite this usher.');
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

        {/* portfolio — work photos the usher uploaded */}
        {(u.portfolio ?? []).length > 0 ? (
          <Box style={{ gap: 8 }}>
            <Text variant="headingS">Work photos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {(u.portfolio ?? []).map((p) => (
                <Image
                  key={p.id}
                  source={{ uri: p.imageUrl }}
                  style={{ width: 160, height: 200, borderRadius: theme.borderRadii.lg, backgroundColor: theme.colors.bgSubtle }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={150}
                  recyclingKey={p.id}
                />
              ))}
            </ScrollView>
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
            (reviews.data ?? []).map((rv) => (
              <ReviewCard key={rv.id} name={rv.reviewerName} date={shortDate(rv.createdAt)} comment={rv.comment ?? ''} rating={rv.rating} />
            ))
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
