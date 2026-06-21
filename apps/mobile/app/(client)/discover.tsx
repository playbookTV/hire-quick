/**
 * Discover — matches Figma `Client / 10 Discover` (27:214): title + subtitle, a
 * search field with a filter affordance, filter chips, and a list of StaffCards.
 * Staff data is stubbed until the Discover API lands.
 */
import { useState } from 'react';
import { Pressable, ScrollView, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { Chip } from '../../components/Chip.js';
import { StaffCard } from '../../components/StaffCard.js';
import { Icon } from '../../components/Icon.js';

const FILTERS = ['Available today', 'Ikoyi', '₦10–20k', '4★+'];
const STAFF = [
  { name: 'Ada Martins', meta: '4.9 · 120 jobs · Ikoyi', price: '₦15,000' },
  { name: 'Bisi Okoro', meta: '4.8 · 86 jobs · Lekki', price: '₦14,000' },
  { name: 'Chioma Eze', meta: '5.0 · 54 jobs · VI', price: '₦16,000' },
];

export default function Discover(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<Record<string, boolean>>({ 'Available today': true });

  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
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
          style={{ height: 48, paddingHorizontal: 16, gap: 8, borderWidth: 1.5, borderColor: theme.colors.borderDefault }}
        >
          <Icon name="search" size={18} color="inkFaint" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search ushers, roles…"
            placeholderTextColor={theme.colors.inkFaint}
            style={{ flex: 1, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 15, color: theme.colors.inkStrong, paddingVertical: 0 }}
          />
          <Pressable onPress={() => router.push('/(modals)/filters')} hitSlop={8}>
            <Icon name="sliders" size={18} color="inkMuted" />
          </Pressable>
        </Box>

        {/* filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
          style={{ marginHorizontal: -20 }}
          contentInset={{ left: 20, right: 20 }}
        >
          <Box style={{ width: 20 }} />
          {FILTERS.map((f) => (
            <Chip key={f} label={f} selected={!!active[f]} onPress={() => setActive((s) => ({ ...s, [f]: !s[f] }))} />
          ))}
          <Box style={{ width: 20 }} />
        </ScrollView>

        {/* staff list */}
        <Box style={{ gap: 12 }}>
          {STAFF.map((s) => (
            <StaffCard
              key={s.name}
              name={s.name}
              meta={s.meta}
              price={s.price}
              verified
              onPress={() => router.push('/(modals)/staff-profile')}
            />
          ))}
        </Box>
      </ScrollView>
    </Box>
  );
}
