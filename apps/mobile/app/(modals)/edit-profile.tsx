/**
 * Edit profile — lets an usher set their display name, bio and years of
 * experience. Drives `PATCH /api/me` (`useUpdateProfile`); on success it
 * re-hydrates the session (`refreshMe`) so the Profile tab reflects the change.
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Field } from '../../components/Field.js';
import { Input } from '../../components/Input.js';
import { Button } from '../../components/Button.js';
import { useAuth } from '../../lib/auth-context.js';
import { useUpdateProfile } from '../../lib/hooks.js';

export default function EditProfile(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, refreshMe } = useAuth();
  const update = useUpdateProfile();
  const usher = user?.usher;

  const [displayName, setDisplayName] = useState(usher?.displayName ?? '');
  const [bio, setBio] = useState(usher?.bio ?? '');
  const [years, setYears] = useState(String(usher?.yearsExperience ?? 0));

  const onSave = (): void => {
    const name = displayName.trim();
    if (name.length < 2) {
      Alert.alert('Name too short', 'Enter the name clients will see (at least 2 characters).');
      return;
    }
    const yearsExperience = Math.max(0, Math.min(60, Math.round(Number(years) || 0)));
    update.mutate(
      { displayName: name, bio: bio.trim(), yearsExperience },
      {
        onSuccess: () => {
          void refreshMe();
          router.back();
        },
        onError: (e: unknown) => Alert.alert('Couldn’t save', e instanceof Error ? e.message : 'Try again.'),
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
          <Field label="About you" helper="A short intro — experience, strengths, languages.">
            <Input
              value={bio}
              onChangeText={setBio}
              placeholder="Experienced event usher, fluent in English & Yoruba…"
              multiline
              numberOfLines={4}
              maxLength={2000}
              textAlignVertical="top"
            />
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
