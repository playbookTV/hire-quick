/**
 * Filters — matches Figma `Client / 11 Filters` (41:506): chip groups
 * (Availability / Location / Min rating), a budget range, a "Verified only"
 * toggle, then Reset / Show-results. Static preview of the Discover filters.
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Chip } from '../../components/Chip.js';
import { Toggle } from '../../components/Toggle.js';
import { ProgressBar } from '../../components/ProgressBar.js';
import { Button } from '../../components/Button.js';

function Group({ title, options, multi }: { title: string; options: string[]; multi?: boolean }) {
  const [active, setActive] = useState<Record<string, boolean>>({ [options[0]]: true });
  return (
    <Box style={{ gap: 12 }}>
      <Text variant="headingS">{title}</Text>
      <Box flexDirection="row" flexWrap="wrap" style={{ gap: 8 }}>
        {options.map((o) => (
          <Chip
            key={o}
            label={o}
            selected={!!active[o]}
            onPress={() => setActive((s) => (multi ? { ...s, [o]: !s[o] } : { [o]: true }))}
          />
        ))}
      </Box>
    </Box>
  );
}

export default function Filters(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [verified, setVerified] = useState(true);

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Filters" showBack inset />
      <Screen scroll>
        <Box style={{ gap: 24 }}>
          <Group title="Availability" options={['Today', 'This week', 'Any time']} />
          <Group title="Location" options={['Ikoyi', 'Lekki', 'Victoria Island', 'Mainland']} multi />

          {/* budget */}
          <Box style={{ gap: 12 }}>
            <Text variant="headingS">Budget per head</Text>
            <Box flexDirection="row" alignItems="center" justifyContent="space-between">
              <Box backgroundColor="bgSurface" borderWidth={1.5} borderColor="borderStrong" borderRadius="md" style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
                <Text variant="label" style={{ fontSize: 15 }} color="inkStrong">
                  ₦10,000
                </Text>
              </Box>
              <Text variant="body" color="inkMuted">
                to
              </Text>
              <Box backgroundColor="bgSurface" borderWidth={1.5} borderColor="borderStrong" borderRadius="md" style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
                <Text variant="label" style={{ fontSize: 15 }} color="inkStrong">
                  ₦20,000
                </Text>
              </Box>
            </Box>
            <Box style={{ height: 6 }}>
              <ProgressBar progress={0.5} />
            </Box>
          </Box>

          <Group title="Minimum rating" options={['Any', '4★ +', '4.5★ +']} />

          {/* verified toggle */}
          <Box flexDirection="row" alignItems="center" justifyContent="space-between">
            <Box>
              <Text variant="label" style={{ fontSize: 15, lineHeight: 20 }} color="inkStrong">
                Verified only
              </Text>
              <Text variant="bodySm" color="inkMuted">
                Show ID-verified ushers
              </Text>
            </Box>
            <Toggle value={verified} onChange={setVerified} />
          </Box>
        </Box>

        <Box style={{ flex: 1, minHeight: 20 }} />
        <Box flexDirection="row" style={{ gap: 12, paddingBottom: insets.bottom }}>
          <Box>
            <Button label="Reset" variant="secondary" fullWidth={false} onPress={() => router.back()} />
          </Box>
          <Box flex={1}>
            <Button label="Show 24 results" onPress={() => router.back()} />
          </Box>
        </Box>
      </Screen>
    </Box>
  );
}
