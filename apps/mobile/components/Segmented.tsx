/**
 * Segmented — a compact tab control for switching list views in place
 * (e.g. Jobs → Available / Applied / Saved). Controlled via `value`/`onChange`.
 */
import { Pressable } from 'react-native';
import { useTheme, Box, Text } from '../theme/restyle.js';

interface SegmentedProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>): React.JSX.Element {
  const theme = useTheme();
  return (
    <Box flexDirection="row" backgroundColor="bgSubtle" borderRadius="pill" style={{ padding: 4, gap: 4 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={{ flex: 1 }}>
            <Box
              alignItems="center"
              justifyContent="center"
              borderRadius="pill"
              style={{
                paddingVertical: 8,
                backgroundColor: on ? theme.colors.bgSurface : 'transparent',
                shadowColor: '#0A0D14',
                shadowOpacity: on ? 0.06 : 0,
                shadowRadius: 2,
                shadowOffset: { width: 0, height: 1 },
              }}
            >
              <Text variant="label" style={{ fontSize: 13 }} color={on ? 'inkStrong' : 'inkMuted'}>
                {o.label}
              </Text>
            </Box>
          </Pressable>
        );
      })}
    </Box>
  );
}
