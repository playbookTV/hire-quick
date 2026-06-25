/**
 * Rate Staff — matches Figma `Client / 20 Rate Staff` (38:449): per-usher rating
 * with a star row, a descriptor, quick tag chips, and an optional comment, then
 * "Submit & continue" / "Skip". Static preview until the reviews API is wired.
 */
import { useState } from 'react';
import { Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { TextArea } from '../../components/TextArea.js';
import { Button } from '../../components/Button.js';
import { Icon } from '../../components/Icon.js';
import { useCreateReview } from '../../lib/hooks.js';
import { useToast } from '../../lib/toast.js';

const LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];
const TAGS = ['Punctual', 'Professional', 'Great presentation', 'Friendly'];

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || 'U';
}

export default function RateStaff(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const { booking, name: rawName } = useLocalSearchParams<{ booking: string; name: string }>();
  const name = rawName ?? 'your usher';
  const review = useCreateReview(booking ?? '');
  const toast = useToast();
  const [rating, setRating] = useState(5);
  const [tags, setTags] = useState<Record<string, boolean>>({ Punctual: true, Professional: true });
  const [comment, setComment] = useState('');

  const submit = (): void => {
    if (!booking) {
      router.back();
      return;
    }
    const tagText = TAGS.filter((t) => tags[t]).join(' · ');
    const full = [tagText, comment.trim()].filter(Boolean).join(' — ') || undefined;
    review.mutate(
      { rating, comment: full },
      {
        onSuccess: () => {
          toast.success('Thanks — your review helps the community.', 'Review submitted');
          router.back();
        },
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Please try again.', 'Couldn’t submit'),
      },
    );
  };

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Rate your staff" showBack inset />
      <Screen scroll>
        <Box alignItems="center" style={{ gap: 20 }}>
          <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, lineHeight: 14, letterSpacing: 1.2 }} color="accentGoldStrong">
            USHER 1 OF 2
          </Text>

          <Box
            style={{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandEmeraldTint }}
          >
            <Text style={{ fontFamily: 'Fraunces_600SemiBold', fontSize: 22, lineHeight: 28, color: theme.colors.brandEmerald }}>{initials(name)}</Text>
          </Box>

          <Text variant="h2" style={{ textAlign: 'center' }}>
            How was {name}?
          </Text>

          <Box flexDirection="row" style={{ gap: 8 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setRating(n)} hitSlop={4}>
                <Icon name="star" size={38} color={n <= rating ? 'accentGold' : 'borderStrong'} />
              </Pressable>
            ))}
          </Box>

          <Text variant="label" style={{ fontSize: 15 }} color="accentGoldStrong">
            {LABELS[rating]}
          </Text>

          <Box flexDirection="row" flexWrap="wrap" justifyContent="center" style={{ gap: 8 }}>
            {TAGS.map((t) => {
              const on = !!tags[t];
              return (
                <Pressable key={t} onPress={() => setTags((s) => ({ ...s, [t]: !s[t] }))}>
                  <Box
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: theme.borderRadii.pill,
                      borderWidth: on ? 0 : 1.5,
                      borderColor: theme.colors.borderStrong,
                      backgroundColor: on ? theme.colors.brandEmerald : theme.colors.bgSurface,
                    }}
                  >
                    <Text
                      style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, lineHeight: 16, letterSpacing: 0.2 }}
                      color={on ? 'inverseInk' : 'inkDefault'}
                    >
                      {t}
                    </Text>
                  </Box>
                </Pressable>
              );
            })}
          </Box>

          <Box alignSelf="stretch">
            <TextArea placeholder="Add a comment (optional)…" value={comment} onChangeText={setComment} maxLength={500} />
          </Box>
        </Box>

        <Box style={{ flex: 1, minHeight: 20 }} />
        <Box style={{ gap: 12 }}>
          <Button label={review.isPending ? 'Submitting…' : 'Submit & continue'} onPress={submit} disabled={review.isPending} />
          <Button label="Skip" variant="ghost" onPress={() => router.back()} />
        </Box>
      </Screen>
    </Box>
  );
}
