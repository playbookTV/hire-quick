/**
 * View Profile — matches Figma `Client / 12 View Profile` (28:269): identity
 * header (avatar, name + Verified, rating line), Work tiles, About, Languages /
 * Experience chips, Reviews, and a Message / Invite action bar. Static preview.
 */
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { AppBar } from '../../components/AppBar.js';
import { Badge } from '../../components/Badge.js';
import { Button } from '../../components/Button.js';
import { Icon } from '../../components/Icon.js';
import { ReviewCard } from '../../components/ReviewCard.js';
import { SectionHeader } from '../../components/SectionHeader.js';

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

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar showBack inset />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, gap: 24 }} showsVerticalScrollIndicator={false}>
        {/* identity */}
        <Box alignItems="center" style={{ gap: 12 }}>
          <Box style={{ width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandEmeraldTint }}>
            <Text style={{ fontFamily: 'Fraunces_600SemiBold', fontSize: 22, lineHeight: 28, color: theme.colors.brandEmerald }}>AM</Text>
          </Box>
          <Box flexDirection="row" alignItems="center" style={{ gap: 8 }}>
            <Text variant="h1">Ada Martins</Text>
            <Badge />
          </Box>
          <Text variant="bodyLg" color="inkMuted">
            Usher · Ikoyi, Lagos
          </Text>
          <Box flexDirection="row" alignItems="center" style={{ gap: 6 }}>
            <Icon name="star" size={16} color="accentGold" />
            <Text variant="label" style={{ fontSize: 15 }} color="inkStrong">
              4.9
            </Text>
            <Text variant="bodyLg" color="inkFaint">·</Text>
            <Text variant="bodyLg" color="inkMuted">120 jobs</Text>
            <Text variant="bodyLg" color="inkFaint">·</Text>
            <Text variant="label" style={{ fontSize: 13 }} color="statusSuccess">
              98% reliable
            </Text>
          </Box>
        </Box>

        {/* work */}
        <Box style={{ gap: 12 }}>
          <Text variant="headingS">Work</Text>
          <Box flexDirection="row" style={{ gap: 12 }}>
            {[0, 1, 2].map((i) => (
              <Box key={i} flex={1} style={{ height: 96, borderRadius: theme.borderRadii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandEmeraldTint }}>
                <Icon name="image" size={26} color="brandEmerald" />
              </Box>
            ))}
          </Box>
        </Box>

        {/* about */}
        <Box style={{ gap: 8 }}>
          <Text variant="headingS">About</Text>
          <Text variant="body" color="inkDefault">
            Professional usher with 5 years across weddings, corporate galas and brand activations. Calm under pressure, impeccable presentation, fluent host.
          </Text>
        </Box>

        {/* languages / experience */}
        <Box style={{ gap: 12 }}>
          <Box style={{ gap: 8 }}>
            <Text variant="labelSm" color="inkMuted">Languages</Text>
            <Box flexDirection="row" style={{ gap: 8 }}>
              {['English', 'Yoruba', 'Pidgin'].map((l) => (
                <Pill key={l} label={l} />
              ))}
            </Box>
          </Box>
          <Box style={{ gap: 8 }}>
            <Text variant="labelSm" color="inkMuted">Experience</Text>
            <Box flexDirection="row">
              <Pill label="5 years" />
            </Box>
          </Box>
        </Box>

        {/* reviews */}
        <Box style={{ gap: 12 }}>
          <SectionHeader title="Reviews" />
          <ReviewCard name="Sarah Johnson" date="2 weeks ago" comment="Ada was punctual, polished and ran the welcome desk flawlessly. Guests loved her." />
          <ReviewCard name="Tunde A." date="1 month ago" comment="Reliable and professional. Will book again for our next gala." />
        </Box>
      </ScrollView>

      {/* action bar */}
      <Box flexDirection="row" backgroundColor="bgCanvas" style={{ gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 16, borderTopWidth: 1.5, borderTopColor: theme.colors.borderDefault }}>
        <Box flex={1}>
          <Button label="Message" variant="secondary" onPress={() => router.back()} />
        </Box>
        <Box flex={1}>
          <Button label="Invite" onPress={() => router.back()} />
        </Box>
      </Box>
    </Box>
  );
}
