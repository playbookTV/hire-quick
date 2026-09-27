/**
 * Usher Profile Setup — matches Figma `Usher / 10 Profile Setup` (54:284): a step
 * indicator, avatar uploader, name / experience / bio fields, language chips, and
 * a work-photos grid. "Continue" advances to ID verification. (Static fields
 * until the usher onboarding API is wired.)
 */
import { useEffect, useRef, useState } from 'react';
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
  const { user, refreshMe } = useAuth();
  const update = useUpdateProfile();
  const [name, setName] = useState(user?.usher?.displayName ?? '');
  const [years, setYears] = useState(String(user?.usher?.yearsExperience ?? ''));
  const [bio, setBio] = useState(user?.usher?.bio ?? '');
  const [langs, setLangs] = useState<Record<string, boolean>>(() =>
    Object.fromEntries((user?.usher?.languages ?? []).map((language) => [language, true])),
  );
  const [error, setError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  const savedInput = useRef<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const nameError =
    name.trim().length > 0 && name.trim().length < 2 ? 'Enter at least 2 characters.' : undefined;
  const bioError =
    bio.trim().length > 0 && bio.trim().length < 2
      ? 'Add at least 2 characters about your experience.'
      : undefined;
  const yearsError =
    !Number.isInteger(Number(years)) || Number(years) < 0 || Number(years) > 60
      ? 'Enter a whole number from 0 to 60.'
      : undefined;
  const onContinue = async (): Promise<void> => {
    if (lock.current) return;
    lock.current = true;
    setSubmitting(true);
    setError(null);
    const input = {
      displayName: name.trim(),
      bio: bio.trim(),
      yearsExperience: Number(years) || 0,
      languages: Object.keys(langs).filter((language) => langs[language]),
    };
    const fingerprint = JSON.stringify(input);
    try {
      if (savedInput.current !== fingerprint) {
        await update.mutateAsync(input);
        savedInput.current = fingerprint;
      }
      if (!mounted.current) return;
      const refreshed = await refreshMe();
      if (!mounted.current) return;
      if (!refreshed?.usher?.displayName || !refreshed.usher.bio) {
        setError(
          'Your profile was saved, but we couldn’t load the update. Check your connection and tap Continue to retry.',
        );
        return;
      }
      router.replace('/(verification)/id-verification');
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : 'Couldn’t save your profile. Please try again.');
    } finally {
      lock.current = false;
      if (mounted.current) setSubmitting(false);
    }
  };

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Set up your profile" showBack inset />
      <Screen scroll>
        <Box style={{ gap: 16 }}>
          <StepIndicator total={5} current={2} label="STEP 3 OF 5 · YOUR PROFILE" />

          <Box alignItems="center" style={{ gap: 8 }}>
            <AvatarPicker size={96} />
            <Text variant="bodySm" color="inkMuted">
              Add a clear, friendly headshot
            </Text>
          </Box>

          <Field label="Full name" required helper="At least 2 characters." error={nameError}>
            <Input
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              maxLength={120}
              editable={!submitting}
              error={!!nameError}
            />
          </Field>
          <Field
            label="Years of experience"
            helper="A whole number from 0 to 60. Use 0 if you’re new."
            error={yearsError}
          >
            <Input
              value={years}
              editable={!submitting}
              error={!!yearsError}
              onChangeText={setYears}
              keyboardType="number-pad"
              placeholder="0"
            />
          </Field>
          <Field
            label="Short bio"
            required
            helper="Tell clients about your experience. Up to 2,000 characters."
            error={bioError}
          >
            <TextArea
              value={bio}
              maxLength={2000}
              editable={!submitting}
              error={!!bioError}
              onChangeText={setBio}
              placeholder="Tell clients about your experience and strengths…"
            />
          </Field>

          <Field label="Languages (optional)">
            <Box flexDirection="row" flexWrap="wrap" style={{ gap: 8 }}>
              {LANGUAGES.map((l) => (
                <Chip
                  key={l}
                  disabled={submitting}
                  label={l}
                  selected={!!langs[l]}
                  onPress={() => setLangs((s) => ({ ...s, [l]: !s[l] }))}
                />
              ))}
            </Box>
          </Field>

          <Field label="Work photos (optional)">
            <PortfolioEditor />
          </Field>
        </Box>
      </Screen>

      <Box
        backgroundColor="bgSurface"
        style={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: insets.bottom + 16,
          gap: 10,
        }}
      >
        {error ? (
          <Box
            flexDirection="row"
            alignItems="center"
            backgroundColor="statusDangerTint"
            borderRadius="md"
            padding="300"
            style={{ gap: 8 }}
          >
            <Icon name="alert-circle" size={16} color="statusDanger" />
            <Text
              variant="bodySm"
              color="statusDanger"
              accessibilityRole="alert"
              style={{ flex: 1 }}
            >
              {error}
            </Text>
          </Box>
        ) : null}
        <Button
          label={submitting ? 'Saving…' : 'Continue'}
          onPress={() => {
            void onContinue();
          }}
          loading={submitting}
          disabled={
            submitting ||
            name.trim().length < 2 ||
            bio.trim().length < 2 ||
            !Number.isInteger(Number(years)) ||
            Number(years) < 0 ||
            Number(years) > 60
          }
        />
      </Box>
    </Box>
  );
}
