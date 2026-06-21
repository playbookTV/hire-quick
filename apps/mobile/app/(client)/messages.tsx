/**
 * Messages — matches Figma `Client / 15 Messages` (32:333): a conversation list,
 * each row = Avatar + name/time, a gold event overline, and a preview; unread
 * rows get an emerald-tint-weak background + dot. Stub data until chat lands.
 */
import { Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Text } from '../../theme/restyle.js';
import { Avatar } from '../../components/Avatar.js';

const THREADS = [
  { name: 'Ada Martins', time: '2m', event: "ADEOLA'S WEDDING", preview: 'Got it — I’ll arrive by 3:30 to set up the welcome desk.', unread: true },
  { name: 'Bisi Okoro', time: '1h', event: "ADEOLA'S WEDDING", preview: 'Thank you! See you Saturday.', unread: false },
  { name: 'Chioma Eze', time: '3h', event: 'CORPORATE GALA', preview: 'Is the dress code strictly black tie?', unread: false },
  { name: 'Dele Smith', time: '1d', event: 'BRAND LAUNCH', preview: 'Payment received, thanks for confirming.', unread: false },
];

export default function Messages(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 16 }} showsVerticalScrollIndicator={false}>
        <Text variant="h2">Messages</Text>
        <Box style={{ gap: 4 }}>
          {THREADS.map((t) => (
            <Pressable key={t.name} onPress={() => router.push('/(modals)/message-thread')}>
              <Box
                flexDirection="row"
                alignItems="center"
                borderRadius="md"
                backgroundColor={t.unread ? 'brandEmeraldTintWeak' : 'transparent'}
                style={{ gap: 12, paddingHorizontal: 8, paddingVertical: 12 }}
              >
                <Avatar name={t.name} size={48} />
                <Box flex={1} style={{ gap: 2 }}>
                  <Box flexDirection="row" alignItems="center" justifyContent="space-between">
                    <Text variant="label" style={{ fontSize: 15, lineHeight: 20 }} color="inkStrong">
                      {t.name}
                    </Text>
                    <Text variant="bodySm" color="inkFaint">
                      {t.time}
                    </Text>
                  </Box>
                  <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, lineHeight: 14, letterSpacing: 1.2 }} color="accentGoldStrong">
                    {t.event}
                  </Text>
                  <Text variant="bodySm" color={t.unread ? 'inkDefault' : 'inkMuted'} numberOfLines={1}>
                    {t.preview}
                  </Text>
                </Box>
                {t.unread ? <Box style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#0B6B53' }} /> : null}
              </Box>
            </Pressable>
          ))}
        </Box>
      </ScrollView>
    </Box>
  );
}
