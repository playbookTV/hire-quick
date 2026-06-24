/**
 * Complete Profile — matches Figma `Client / 05 Complete Profile` (20:199):
 * AddPhoto + Full name (+ Business name) for clients; ushers get a bio +
 * experience. Only fields the API accepts (`displayName`/`bio`/`yearsExperience`)
 * are submitted. If the profile is already filled, skip to the role home.
 */
import { useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { StepIndicator } from '../../components/StepIndicator.js';
import { Field } from '../../components/Field.js';
import { Input } from '../../components/Input.js';
import { TextArea } from '../../components/TextArea.js';
import { Stepper } from '../../components/Stepper.js';
import { AddPhoto } from '../../components/AddPhoto.js';
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
  const [business, setBusiness] = useState('');
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
      <AppBar showBack />
      <Screen scroll>
        <Box marginBottom="500">
          <StepIndicator total={3} current={2} label="ACCOUNT SETUP" />
        </Box>
        <Box style={{ gap: 20 }} marginBottom="600">
          <Box style={{ gap: 8 }}>
            <Text variant="h1">{isUsher ? 'Tell clients about you' : 'Set up your profile'}</Text>
            <Text variant="body" color="inkMuted">
              {isUsher ? 'A short intro helps you stand out.' : 'This is what staff see when you hire.'}
            </Text>
          </Box>

          {error ? <Banner tone="warning" message={error} /> : null}

          <AddPhoto variant="avatar" />

          {isUsher ? (
            <>
              <Field label="Short bio" helper="Experience, the events you work, your strengths.">
                <TextArea
                  placeholder="e.g. 3 years ushering weddings and corporate launches…"
                  value={bio}
                  onChangeText={setBio}
                  maxLength={2000}
                />
              </Field>
              <Field label="Years of experience">
                <Stepper value={years} onChange={setYears} min={0} max={60} />
              </Field>
              <Banner
                tone="brand"
                title="Verification comes next"
                message="You’ll verify your ID before you can apply to jobs."
              />
            </>
          ) : (
            <>
              <Field label="Full name">
                <Input placeholder="e.g. Sarah Johnson" value={name} onChangeText={setName} autoCapitalize="words" maxLength={120} />
              </Field>
              <Field label="Business name (optional)">
                <Input placeholder="e.g. Lagos Events Co." value={business} onChangeText={setBusiness} maxLength={120} />
              </Field>
            </>
          )}
        </Box>

        <Button label="Continue" disabled={!valid} loading={update.isPending} onPress={submit} />
      </Screen>
    </Box>
  );
}
