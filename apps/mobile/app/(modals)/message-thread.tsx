/**
 * Message Thread — matches Figma `Client / 16 Message Thread` (33:377): a contact
 * header, a safety Banner, day-grouped chat bubbles (emerald outbound / surface
 * inbound), and a composer bar. Static preview until chat is wired.
 */
import { Pressable, ScrollView, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { Avatar } from '../../components/Avatar.js';
import { Banner } from '../../components/Banner.js';
import { Icon } from '../../components/Icon.js';

const MESSAGES = [
  { mine: true, text: 'Hi Ada! Confirmed for Saturday — venue is Eko Hotel, 4pm. Dress code is black tie.' },
  { mine: false, text: 'Perfect, thank you! I’ll arrive by 3:30 to set up the welcome desk.' },
  { mine: true, text: 'Wonderful. I’ll generate your check-in code on the day.' },
];

export default function MessageThread(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      {/* header */}
      <Box
        flexDirection="row"
        alignItems="center"
        style={{ gap: 12, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1.5, borderBottomColor: theme.colors.borderDefault }}
      >
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Icon name="chevron-left" size={24} color="inkStrong" />
        </Pressable>
        <Avatar name="Ada Martins" size={40} />
        <Box flex={1}>
          <Text variant="label" style={{ fontSize: 15, lineHeight: 20 }} color="inkStrong">
            Ada Martins
          </Text>
          <Text variant="bodySm" color="inkMuted">
            Booking · Adeola’s Wedding
          </Text>
        </Box>
      </Box>

      <Box style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
        <Banner tone="warning" message="For your protection, keep coordination & payment on HireQuick." />
      </Box>

      {/* messages */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1, justifyContent: 'flex-end' }}>
        <Box alignSelf="center" backgroundColor="bgSubtle" borderRadius="pill" style={{ paddingHorizontal: 12, paddingVertical: 4 }}>
          <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, lineHeight: 14, letterSpacing: 1.2 }} color="inkMuted">
            Today
          </Text>
        </Box>
        {MESSAGES.map((m, i) => (
          <Box
            key={i}
            style={{
              maxWidth: '78%',
              alignSelf: m.mine ? 'flex-end' : 'flex-start',
              paddingHorizontal: 16,
              paddingVertical: 12,
              backgroundColor: m.mine ? theme.colors.brandEmerald : theme.colors.bgSurface,
              borderWidth: m.mine ? 0 : 1,
              borderColor: theme.colors.borderDefault,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              borderBottomLeftRadius: m.mine ? 16 : 6,
              borderBottomRightRadius: m.mine ? 6 : 16,
            }}
          >
            <Text variant="body" color={m.mine ? 'inverseInk' : 'inkDefault'}>
              {m.text}
            </Text>
          </Box>
        ))}
      </ScrollView>

      {/* composer */}
      <Box
        flexDirection="row"
        alignItems="center"
        style={{ gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 12, borderTopWidth: 1.5, borderTopColor: theme.colors.borderDefault }}
      >
        <Icon name="plus" size={22} color="inkMuted" />
        <Box flex={1} backgroundColor="bgSubtle" borderRadius="pill" style={{ height: 44, justifyContent: 'center', paddingHorizontal: 16 }}>
          <TextInput placeholder="Message…" placeholderTextColor={theme.colors.inkFaint} style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 15, color: theme.colors.inkStrong, paddingVertical: 0 }} />
        </Box>
        <Box style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandEmerald }}>
          <Icon name="arrow-right" size={20} color="inverseInk" />
        </Box>
      </Box>
    </Box>
  );
}
