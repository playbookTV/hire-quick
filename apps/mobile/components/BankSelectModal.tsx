/**
 * BankSelectModal — searchable Nigerian bank picker for the withdraw flow.
 * Banks come from `useBanks()` (Paystack list). Presented as a bottom sheet;
 * tapping a bank returns it via `onSelect`.
 */
import { useState, useMemo } from 'react';
import { Modal, Pressable, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../theme/restyle.js';
import { Input } from './Input.js';
import { Icon } from './Icon.js';
import { Loading } from './Loading.js';
import { useBanks } from '../lib/hooks.js';
import type { Bank } from '../lib/types.js';

interface Props {
  visible: boolean;
  selectedCode?: string | null;
  onSelect: (bank: Bank) => void;
  onClose: () => void;
}

export function BankSelectModal({ visible, selectedCode, onSelect, onClose }: Props): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const banks = useBanks();
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const list = banks.data ?? [];
    const needle = q.trim().toLowerCase();
    return needle ? list.filter((b) => b.name.toLowerCase().includes(needle)) : list;
  }, [banks.data, q]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(10,13,20,0.4)' }} onPress={onClose} />
      <Box
        backgroundColor="bgCanvas"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '80%',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingTop: 12,
          paddingBottom: insets.bottom + 12,
        }}
      >
        <Box style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.borderStrong, marginBottom: 12 }} />
        <Box flexDirection="row" alignItems="center" justifyContent="space-between" style={{ paddingHorizontal: 20, marginBottom: 12 }}>
          <Text variant="headingS">Choose your bank</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Icon name="x" size={22} color="inkMuted" />
          </Pressable>
        </Box>
        <Box style={{ paddingHorizontal: 20, marginBottom: 8 }}>
          <Input value={q} onChangeText={setQ} placeholder="Search banks" leftIcon="search" autoCapitalize="none" />
        </Box>
        {banks.isLoading ? (
          <Loading />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(b) => b.code}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4 }}
            ListEmptyComponent={<Text variant="bodySm" color="inkMuted">No banks match “{q}”.</Text>}
            renderItem={({ item }) => {
              const on = item.code === selectedCode;
              return (
                <Pressable onPress={() => onSelect(item)}>
                  <Box flexDirection="row" alignItems="center" justifyContent="space-between" style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.borderDefault, gap: 12 }}>
                    <Text variant="body" color="inkStrong" numberOfLines={1} style={{ flex: 1 }}>{item.name}</Text>
                    {on ? <Icon name="check" size={18} color="brandEmerald" /> : null}
                  </Box>
                </Pressable>
              );
            }}
          />
        )}
      </Box>
    </Modal>
  );
}
