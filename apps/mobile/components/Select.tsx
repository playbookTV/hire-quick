/**
 * Select — Figma dropdown. A pressable row showing the value + chevron that
 * opens a bottom-sheet-style modal list. Generic over the option value.
 */
import { useState } from 'react';
import { Modal, Pressable, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../theme/restyle.js';
import { Icon } from './Icon.js';

export interface SelectOption<T extends string> {
  label: string;
  value: T;
}

interface SelectProps<T extends string> {
  value: T | null;
  options: SelectOption<T>[];
  onSelect: (value: T) => void;
  placeholder?: string;
  error?: boolean;
  title?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function Select<T extends string>({
  value,
  options,
  onSelect,
  placeholder = 'Select…',
  error = false,
  title,
  accessibilityLabel,
  accessibilityHint,
}: SelectProps<T>): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title ?? placeholder}
        accessibilityValue={{ text: selected?.label ?? placeholder }}
        accessibilityState={{ expanded: open }}
        accessibilityHint={accessibilityHint ?? title}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 52,
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderRadius: theme.borderRadii.md,
          borderWidth: 1.5,
          borderColor: error ? theme.colors.statusDanger : theme.colors.borderDefault,
          backgroundColor: theme.colors.bgSurface,
        }}
      >
        <Text variant="body" color={selected ? 'inkStrong' : 'inkFaint'} style={{ flex: 1 }}>
          {selected?.label ?? placeholder}
        </Text>
        <Icon name="chevron-down" size={20} color="inkMuted" />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: theme.colors.overlay }}
          onPress={() => setOpen(false)}
        >
          <Box flex={1} justifyContent="flex-end">
            <Pressable onPress={(e) => e.stopPropagation()}>
              <Box
                backgroundColor="bgSurface"
                borderTopLeftRadius="xl"
                borderTopRightRadius="xl"
                paddingTop="500"
                style={{ paddingBottom: insets.bottom + 12, maxHeight: 420 }}
              >
                {title ? (
                  <Text variant="title" marginBottom="300" style={{ paddingHorizontal: 20 }}>
                    {title}
                  </Text>
                ) : null}
                <FlatList
                  data={options}
                  keyExtractor={(o) => o.value}
                  renderItem={({ item }) => {
                    const active = item.value === value;
                    return (
                      <Pressable
                        onPress={() => {
                          onSelect(item.value);
                          setOpen(false);
                        }}
                        accessibilityRole="menuitem"
                        accessibilityLabel={item.label}
                        accessibilityState={{ selected: active }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingHorizontal: 20,
                          paddingVertical: 14,
                        }}
                      >
                        <Text variant="bodyLg" color={active ? 'brandEmerald' : 'inkDefault'}>
                          {item.label}
                        </Text>
                        {active ? <Icon name="check" size={18} color="brandEmerald" /> : null}
                      </Pressable>
                    );
                  }}
                />
              </Box>
            </Pressable>
          </Box>
        </Pressable>
      </Modal>
    </>
  );
}
