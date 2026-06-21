/**
 * Dispute — matches Figma `Client / 22 Dispute` (40:487): a frozen-escrow info
 * Banner, a reason picker (OptionCards), a details TextArea, an auto-attach note,
 * then "Submit dispute" / "Cancel". Static preview until the disputes API wires.
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Banner } from '../../components/Banner.js';
import { OptionCard } from '../../components/OptionCard.js';
import { TextArea } from '../../components/TextArea.js';
import { Button } from '../../components/Button.js';
import { Icon } from '../../components/Icon.js';

const REASONS = ['Usher didn’t show up', 'Arrived late', 'Conduct or presentation', 'Something else'];

export default function Dispute(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState('');

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Open a dispute" showBack inset />
      <Screen scroll>
        <Box style={{ gap: 16 }}>
          <Banner tone="info" message="Funds stay frozen in escrow while our team reviews — usually within 72 hours." />

          <Text variant="headingS">What went wrong?</Text>

          <Box style={{ gap: 8 }}>
            {REASONS.map((r) => (
              <OptionCard key={r} title={r} selected={reason === r} onPress={() => setReason(r)} />
            ))}
          </Box>

          <TextArea placeholder="Tell us what happened…" value={details} onChangeText={setDetails} maxLength={2000} />

          <Box flexDirection="row" alignItems="center" style={{ gap: 8 }}>
            <Icon name="paperclip" size={16} color="inkMuted" />
            <Text variant="bodySm" color="inkMuted" style={{ flex: 1 }}>
              Chat & attendance logs attached automatically
            </Text>
          </Box>
        </Box>

        <Box style={{ flex: 1, minHeight: 20 }} />
        <Box style={{ gap: 12, paddingBottom: insets.bottom }}>
          <Button label="Submit dispute" onPress={() => router.back()} />
          <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
        </Box>
      </Screen>
    </Box>
  );
}
