/**
 * Edit profile — lets an usher set their display name, bio, years of experience,
 * base area, spoken languages, and an indicative day rate. Drives `PATCH /api/me`
 * (`useUpdateProfile`); on success it re-hydrates the session (`refreshMe`) so the
 * Profile tab reflects the change. The day rate is display + discovery-filter sugar
 * only — escrow/order math stays driven by the event's budget (TRD §6).
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Field } from '../../components/Field.js';
import { Input } from '../../components/Input.js';
import { TextArea } from '../../components/TextArea.js';
import { Select } from '../../components/Select.js';
import { Chip } from '../../components/Chip.js';
import { Button } from '../../components/Button.js';
import { useAuth } from '../../lib/auth-context.js';
import { useUpdateProfile } from '../../lib/hooks.js';
import { useToast } from '../../lib/toast.js';
import { NIGERIAN_STATES } from '@hq/shared';

// Common languages on Lagos event jobs — kept short so the chips stay one or two rows.
const LANGUAGE_OPTIONS = ['English', 'Pidgin', 'Yoruba', 'Igbo', 'Hausa', 'French'];
const STATE_OPTIONS = NIGERIAN_STATES.map((s) => ({ value: s, label: s }));

export default function EditProfile(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, refreshMe } = useAuth();
  const update = useUpdateProfile();
  const toast = useToast();
  const usher = user?.usher;

  const [displayName, setDisplayName] = useState(usher?.displayName ?? '');
  const [bio, setBio] = useState(usher?.bio ?? '');
  const [years, setYears] = useState(String(usher?.yearsExperience ?? 0));
  const [state, setState] = useState(usher?.state ?? '');
  const [city, setCity] = useState(usher?.city ?? '');
  const [languages, setLanguages] = useState<string[]>(usher?.languages ?? []);
  // Day rate is held in naira for the input; converted to kobo on save.
  const [rate, setRate] = useState(usher?.dayRateKobo ? String(Math.round(usher.dayRateKobo / 100)) : '');

  const toggleLanguage = (lang: string): void => {
    setLanguages((prev) => (prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]));
  };

  const onSave = (): void => {
    const name = displayName.trim();
    if (name.length < 2) {
      toast.error('Enter the name clients will see (at least 2 characters).', 'Name too short');
      return;
    }
    const yearsExperience = Math.max(0, Math.min(60, Math.round(Number(years) || 0)));
    const rateNaira = parseInt(rate.replace(/\D/g, ''), 10);
    update.mutate(
      {
        displayName: name,
        bio: bio.trim(),
        yearsExperience,
        state: state || undefined,
        city: city.trim(),
        languages,
        dayRateKobo: Number.isFinite(rateNaira) ? rateNaira * 100 : 0,
      },
      {
        onSuccess: () => {
          void refreshMe();
          toast.success('Your profile was updated.', 'Saved');
          router.back();
        },
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Try again.', 'Couldn’t save'),
      },
    );
  };

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Edit profile" showBack inset />
      <Screen scroll>
        <Box style={{ gap: 16 }}>
          <Field label="Display name" helper="Shown to clients when you apply.">
            <Input value={displayName} onChangeText={setDisplayName} placeholder="e.g. Ada Martins" maxLength={120} />
          </Field>
          <Field label="About you" helper="A short intro — experience, strengths, the events you work.">
            <TextArea
              value={bio}
              onChangeText={setBio}
              placeholder="Experienced event usher, fluent in English & Yoruba…"
              maxLength={2000}
            />
          </Field>
          <Field label="State" helper="You'll only see jobs in this state.">
            <Select title="State" value={state || null} placeholder="Choose your state" options={STATE_OPTIONS} onSelect={setState} />
          </Field>
          <Field label="Base area" helper="Where you’re based — clients filter by this.">
            <Input value={city} onChangeText={setCity} placeholder="e.g. Lekki" maxLength={80} />
          </Field>
          <Field label="Languages" helper="Tap the languages you speak.">
            <Box flexDirection="row" flexWrap="wrap" style={{ gap: 8 }}>
              {LANGUAGE_OPTIONS.map((lang) => (
                <Chip
                  key={lang}
                  label={lang}
                  selected={languages.includes(lang)}
                  onPress={() => toggleLanguage(lang)}
                />
              ))}
            </Box>
          </Field>
          <Field label="Day rate" helper="Indicative only — clients pay the event’s set budget.">
            <Input
              prefix="₦"
              value={rate}
              onChangeText={(t) => setRate(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              placeholder="e.g. 25000"
              maxLength={9}
            />
            {rate ? (
              <Text variant="bodySm" color="inkFaint" marginTop="100">
                Shown to clients as ₦{Number(rate).toLocaleString('en-NG')}/day
              </Text>
            ) : null}
          </Field>
          <Field label="Years of experience">
            <Input value={years} onChangeText={setYears} keyboardType="number-pad" placeholder="0" />
          </Field>
          <Button label={update.isPending ? 'Saving…' : 'Save profile'} onPress={onSave} disabled={update.isPending} />
        </Box>
      </Screen>
      <Box style={{ paddingBottom: insets.bottom }} />
    </Box>
  );
}
