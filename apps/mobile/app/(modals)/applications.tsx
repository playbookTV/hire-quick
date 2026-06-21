/**
 * Applications — matches Figma `Client / 14 Applications` (31:311): a selection
 * banner + selectable applicant cards (Avatar, name + optional Shortlisted pill,
 * rating/price, a check/empty circle), with a "Pay & confirm" CTA. Selecting
 * staff → Payment Summary. Static list until the applications API is wired.
 */
import { useState } from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Avatar } from '../../components/Avatar.js';
import { Button } from '../../components/Button.js';
import { Icon } from '../../components/Icon.js';
import { shadowSm } from '../../theme/shadows.js';

const APPLICANTS = [
  { name: 'Ada Martins', meta: '4.9 · 120 jobs · ₦15,000', shortlisted: true },
  { name: 'Bisi Okoro', meta: '4.8 · 86 jobs · ₦14,000' },
  { name: 'Chioma Eze', meta: '5.0 · 54 jobs · ₦16,000' },
  { name: 'Dele Smith', meta: '4.7 · 40 jobs · ₦13,500' },
];

export default function Applications(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<Record<string, boolean>>({ 'Ada Martins': true, 'Bisi Okoro': true });
  const count = Object.values(selected).filter(Boolean).length;

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Applications" showBack inset />
      <Screen scroll>
        {/* selection banner */}
        <Box
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
          backgroundColor="brandEmeraldTintWeak"
          borderRadius="md"
          padding="400"
          marginBottom="300"
        >
          <Box flexDirection="row" alignItems="center" style={{ gap: 8 }}>
            <Icon name="check" size={18} color="brandEmerald" />
            <Text variant="label" style={{ fontSize: 15 }} color="brandEmerald">
              {count} of 2 open slots selected
            </Text>
          </Box>
          <Text variant="bodySm" color="inkMuted">
            Tap to choose
          </Text>
        </Box>

        <Box style={{ gap: 12 }}>
          {APPLICANTS.map((a) => {
            const on = !!selected[a.name];
            return (
              <Pressable key={a.name} onPress={() => setSelected((s) => ({ ...s, [a.name]: !s[a.name] }))}>
                <Box
                  flexDirection="row"
                  alignItems="center"
                  padding="400"
                  borderRadius="lg"
                  borderWidth={on ? 2 : 1}
                  style={[
                    { gap: 12, borderColor: on ? theme.colors.brandEmerald : theme.colors.borderDefault, backgroundColor: on ? theme.colors.brandEmeraldTintWeak : theme.colors.bgSurface },
                    shadowSm,
                  ]}
                >
                  <Avatar name={a.name} size={48} />
                  <Box flex={1} style={{ gap: 4 }}>
                    <Box flexDirection="row" alignItems="center" style={{ gap: 8 }}>
                      <Text variant="titleM" numberOfLines={1}>
                        {a.name}
                      </Text>
                      {a.shortlisted ? (
                        <Box style={{ backgroundColor: theme.colors.accentGoldTint, paddingHorizontal: 8, paddingVertical: 2, borderRadius: theme.borderRadii.pill }}>
                          <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, lineHeight: 14, letterSpacing: 1.2 }} color="accentGoldStrong">
                            Shortlisted
                          </Text>
                        </Box>
                      ) : null}
                    </Box>
                    <Box flexDirection="row" alignItems="center" style={{ gap: 4 }}>
                      <Icon name="star" size={14} color="accentGold" />
                      <Text variant="bodySm" color="inkMuted">
                        {a.meta}
                      </Text>
                    </Box>
                  </Box>
                  <Box
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: on ? 0 : 1.5,
                      borderColor: theme.colors.borderStrong,
                      backgroundColor: on ? theme.colors.brandEmerald : theme.colors.bgSurface,
                    }}
                  >
                    {on ? <Icon name="check" size={16} color="inverseInk" /> : null}
                  </Box>
                </Box>
              </Pressable>
            );
          })}
        </Box>

        <Box style={{ flex: 1, minHeight: 16 }} />
        <Box style={{ gap: 8, paddingBottom: insets.bottom }}>
          <Button label="Pay & confirm · ₦30,000" disabled={count === 0} onPress={() => router.push('/(modals)/payment-summary')} />
          <Text variant="bodySm" color="inkFaint" style={{ textAlign: 'center' }}>
            {count} ushers · funds held in escrow until check-in
          </Text>
        </Box>
      </Screen>
    </Box>
  );
}
