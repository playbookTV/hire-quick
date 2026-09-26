/** Searchable bank picker. Preserve cached results when a refresh fails. */
import { useState, useMemo } from 'react';
import { Modal, Pressable, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../theme/restyle.js';
import { Input } from './Input.js';
import { Icon } from './Icon.js';
import { Loading } from './Loading.js';
import { Button } from './Button.js';
import { useBanks } from '../lib/hooks.js';
import { useMotionPreference } from '../lib/use-motion-preference.js';
import { screenTokens } from '../theme/token-manager.js';
import type { Bank } from '../lib/types.js';

interface Props {
  visible: boolean;
  selectedCode?: string | null;
  onSelect: (bank: Bank) => void;
  onClose: () => void;
}

export function BankSelectModal({
  visible,
  selectedCode,
  onSelect,
  onClose,
}: Props): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useMotionPreference();
  const banks = useBanks();
  const [q, setQ] = useState('');
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const hasCachedBanks = (banks.data?.length ?? 0) > 0;
  const filtered = useMemo(() => {
    const list = banks.data ?? [];
    const needle = q.trim().toLowerCase();
    return needle ? list.filter((b) => b.name.toLowerCase().includes(needle)) : list;
  }, [banks.data, q]);
  const retry = () => {
    void banks.refetch();
  };

  return (
    <Modal
      visible={visible}
      animationType={reducedMotion ? 'none' : 'slide'}
      transparent
      onRequestClose={onClose}
    >
      <Pressable
        accessible={false}
        importantForAccessibility="no"
        style={{ flex: 1, backgroundColor: theme.colors.overlay }}
        onPress={onClose}
      />
      <Box
        backgroundColor="bgCanvas"
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '80%',
          borderTopLeftRadius: theme.borderRadii.sheet,
          borderTopRightRadius: theme.borderRadii.sheet,
          paddingBottom: insets.bottom + theme.spacing['300'],
        }}
      >
        <FlatList
          data={filtered}
          extraData={{ selectedCode, focusKey }}
          keyExtractor={(b) => b.code}
          keyboardShouldPersistTaps="handled"
          style={{ flexShrink: 1 }}
          contentContainerStyle={{ padding: theme.spacing['500'] }}
          ListHeaderComponent={
            <Box gap="300" paddingBottom="200">
              <Box flexDirection="row" alignItems="center" gap="300">
                <Text variant="headingS" accessibilityRole="header" style={{ flex: 1 }}>
                  Choose your bank
                </Text>
                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close bank picker"
                  onFocus={() => setFocusKey('close')}
                  onBlur={() => setFocusKey(null)}
                  style={({ pressed }) => ({
                    minWidth: screenTokens.touchTarget,
                    minHeight: screenTokens.touchTarget,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: theme.borderRadii.sm,
                    backgroundColor: pressed ? theme.colors.bgSurfaceAlt : 'transparent',
                    outlineWidth: focusKey === 'close' ? 3 : 0,
                    outlineColor: theme.colors.borderFocus,
                    outlineOffset: 2,
                  })}
                >
                  <Icon name="x" size={22} color="inkMuted" />
                </Pressable>
              </Box>
              <Input
                value={q}
                onChangeText={setQ}
                accessibilityLabel="Search banks"
                placeholder="Search banks"
                leftIcon="search"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {banks.isError ? (
                <Box gap="300">
                  <Text
                    variant="bodySm"
                    color="statusDanger"
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                  >
                    {hasCachedBanks
                      ? 'The bank list may be out of date. You can choose a listed bank or try again.'
                      : 'Couldn’t load banks. Check your connection and try again.'}
                  </Text>
                  <Button
                    label="Try again"
                    size="md"
                    variant="secondary"
                    loading={banks.isFetching}
                    onPress={retry}
                  />
                </Box>
              ) : null}
            </Box>
          }
          ListEmptyComponent={
            banks.isLoading ? (
              <Box minHeight={100}>
                <Loading />
              </Box>
            ) : banks.isError && !hasCachedBanks ? null : (
              <Box gap="300" paddingVertical="400">
                <Text variant="bodySm" color="inkMuted" accessibilityLiveRegion="polite">
                  {q.trim()
                    ? `No banks match “${q.trim()}”.`
                    : 'No banks are available right now. Try refreshing the list.'}
                </Text>
                {q.trim() ? (
                  <Button label="Clear search" variant="ghost" size="md" onPress={() => setQ('')} />
                ) : !banks.isError ? (
                  <Button
                    label="Refresh banks"
                    variant="secondary"
                    size="md"
                    loading={banks.isFetching}
                    onPress={retry}
                  />
                ) : null}
              </Box>
            )
          }
          renderItem={({ item }) => {
            const selected = item.code === selectedCode;
            return (
              <Pressable
                onPress={() => onSelect(item)}
                accessibilityRole="radio"
                accessibilityLabel={item.name}
                accessibilityState={{ checked: selected }}
                onFocus={() => setFocusKey(item.code)}
                onBlur={() => setFocusKey(null)}
                style={({ pressed }) => ({
                  minHeight: screenTokens.touchTarget,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: theme.spacing['400'],
                  gap: theme.spacing['300'],
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.borderDefault,
                  backgroundColor: pressed ? theme.colors.bgSurfaceAlt : 'transparent',
                  outlineWidth: focusKey === item.code ? 3 : 0,
                  outlineColor: theme.colors.borderFocus,
                  outlineOffset: -3,
                })}
              >
                <Text variant="body" color="inkStrong" style={{ flex: 1 }}>
                  {item.name}
                </Text>
                {selected ? <Icon name="check" size={18} color="brandAccentText" /> : null}
              </Pressable>
            );
          }}
        />
      </Box>
    </Modal>
  );
}
