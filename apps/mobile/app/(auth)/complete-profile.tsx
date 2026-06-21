/**
 * Complete Profile — collects the minimum each role needs after first login.
 * Clients set a display name; ushers add a short bio + experience. If the
 * profile is already filled, we skip straight to the role home.
 */
import { useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Field } from '../../components/Field.js';
import { Input } from '../../components/Input.js';
import { TextArea } from '../../components/TextArea.js';
import { Stepper } from '../../components/Stepper.js';
import { Button } from '../../components/Button.js';
import { Banner } from '../../components/Banner.js';
import { Box, Text } from '../../theme/restyle.js';
import { useAuth } from '../../lib/auth-context.js';
import { useUpdateProfile } from '../../lib/hooks.js';
import { Loading } from '../../components/Loading.js';
import { ApiError } from '../../lib/api-error.js';

export default function CompleteProfile(): React.JSX.Element {
  const router = useRouter();
  const { status, user, refreshMe } = useAuth();
  const update = useUpdateProfile();

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [years, setYears] = useState(0);
  const [error, setError] = useState<string | null>(null);

  if (status === 'loading') return <Loading />;
  if (status === 'guest' || !user) return <Redirect href="/(auth)/welcome" />;

  const isUsher = user.role === 'USHER';
  const clientNamed = !!user.client?.displayName && user.client.displayName !== user.phone;
  const usherFilled = !!user.usher?.bio;
  if ((isUsher && usherFilled) || (!isUsher && clientNamed)) {
    return <Redirect href="/" />;
  }

  const valid = isUsher ? bio.trim().length >= 2 : name.trim().length >= 2;

  const submit = async () => {
    setError(null);
    try {
      await update.mutateAsync(
        isUsher ? { bio: bio.trim(), yearsExperience: years } : { displayName: name.trim() },
      );
      await refreshMe();
      router.replace('/');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save. Try again.');
    }
  };

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Set up your profile" />
      <Screen scroll>
        <Text variant="h1" marginBottom="200">
          {isUsher ? 'Tell clients about you' : 'What should we call you?'}
        </Text>
        <Text variant="body" color="inkMuted" marginBottom="600">
          {isUsher
            ? 'A short intro helps you stand out when clients are choosing staff.'
            : 'This is the name ushers and the team will see.'}
        </Text>

        {error ? (
          <Box marginBottom="400">
            <Banner tone="warning" message={error} />
          </Box>
        ) : null}

        {isUsher ? (
          <>
            <Field label="Short bio" helper="Experience, the kinds of events you work, your strengths.">
              <TextArea
                placeholder="e.g. 3 years ushering weddings and corporate launches across Lagos…"
                value={bio}
                onChangeText={setBio}
                maxLength={2000}
              />
            </Field>
            <Field label="Years of experience">
              <Stepper value={years} onChange={setYears} min={0} max={60} />
            </Field>
            <Box marginTop="200" marginBottom="400">
              <Banner
                tone="brand"
                title="Verification comes next"
                message="You’ll need to verify your ID before you can apply to jobs."
              />
            </Box>
          </>
        ) : (
          <Field label="Full name">
            <Input
              leftIcon="user"
              placeholder="e.g. Adaeze Okafor"
              value={name}
              onChangeText={setName}
              autoFocus
              autoCapitalize="words"
              maxLength={120}
            />
          </Field>
        )}

        <Box flex={1} />
        <Button label="Finish" disabled={!valid} loading={update.isPending} onPress={submit} />
      </Screen>
    </Box>
  );
}
