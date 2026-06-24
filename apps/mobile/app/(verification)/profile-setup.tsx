/**
 * Usher Profile Setup — matches Figma `Usher / 10 Profile Setup` (54:284): a step
 * indicator, avatar uploader, name / experience / bio fields, language chips, and
 * a work-photos grid. "Continue" advances to ID verification. (Static fields
 * until the usher onboarding API is wired.)
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Button } from '../../components/Button.js';
import { Field } from '../../components/Field.js';
import { Input } from '../../components/Input.js';
import { TextArea } from '../../components/TextArea.js';
import { Chip } from '../../components/Chip.js';
import { AvatarPicker } from '../../components/AvatarPicker.js';
import { PortfolioEditor } from '../../components/PortfolioEditor.js';
import { StepIndicator } from '../../components/StepIndicator.js';
import { Icon } from '../../components/Icon.js';
import { useUpdateProfile } from '../../lib/hooks.js';
import { useAuth } from '../../lib/auth-context.js';

const LANGUAGES = ['English', 'Yoruba', 'Pidgin', 'French'];

export default function ProfileSetup(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const update = useUpdateProfile();
  const [name, setName] = useState(user?.usher?.displayName ?? '');
  const [years, setYears] = useState(String(user?.usher?.yearsExperience ?? ''));
  const [bio, setBio] = useState(user?.usher?.bio ?? '');
  const [langs, setLangs] = useState<Record<string, boolean>>({ English: true, Yoruba: true });
  const [error, setError] = useState<string | null>(null);

  const onContinue = (): void => {
    setError(null);
    update.mutate(
      { displayName: name.trim() || undefined, bio: bio.trim() || undefined, yearsExperience: Number(years) || 0 },
      {
        onSuccess: () => router.replace('/(verification)/id-verification'),
        onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Couldn’t save your profile. Please try again.'),
      },
    );
  };

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Set up your profile" showBack inset />
      <Screen scroll>
        <Box style={{ gap: 16 }}>
          <StepIndicator total={5} current={2} label="STEP 3 OF 5 · YOUR PROFILE" />

          <Box alignItems="center" style={{ gap: 8 }}>
            <AvatarPicker size={96} />
            <Text variant="bodySm" color="inkMuted">Add a clear, friendly headshot</Text>
          </Box>

          <Field label="Full name">
            <Input value={name} onChangeText={setName} placeholder="Your name" />
          </Field>
          <Field label="Years of experience">
            <Input value={years} onChangeText={setYears} keyboardType="number-pad" placeholder="0" />
          </Field>
          <Field label="Short bio">
            <TextArea value={bio} onChangeText={setBio} placeholder="Tell clients about your experience and strengths…" />
          </Field>

          <Field label="Languages">
            <Box flexDirection="row" flexWrap="wrap" style={{ gap: 8 }}>
              {LANGUAGES.map((l) => (
                <Chip key={l} label={l} selected={!!langs[l]} onPress={() => setLangs((s) => ({ ...s, [l]: !s[l] }))} />
              ))}
            </Box>
          </Field>

          <Field label="Work photos">
            <PortfolioEditor />
          </Field>
        </Box>
      </Screen>

      <Box backgroundColor="bgSurface" style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 16, gap: 10 }}>
        {error ? (
          <Box flexDirection="row" alignItems="center" backgroundColor="statusDangerTint" borderRadius="md" padding="300" style={{ gap: 8 }}>
            <Icon name="alert-circle" size={16} color="statusDanger" />
            <Text variant="bodySm" color="statusDanger" style={{ flex: 1 }}>{error}</Text>
          </Box>
        ) : null}
        <Button label={update.isPending ? 'Saving…' : 'Continue'} onPress={onContinue} disabled={update.isPending} />
      </Box>
    </Box>
  );
}
