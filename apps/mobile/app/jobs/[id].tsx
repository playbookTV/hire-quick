import { useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { Button } from '../../components/Button.js';
import { useAuth } from '../../lib/auth-context.js';
import { validJobId } from '../../lib/job-links.js';
import { rememberJob } from '../../lib/pending-job.js';
import { useToast } from '../../lib/toast.js';

export default function SharedJob(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const valid = validJobId(id);
  if (valid && user?.role === 'USHER' && user.usher?.displayName && user.usher.bio)
    return <Redirect href={{ pathname: '/(modals)/event-details', params: { id } }} />;
  const open = async (): Promise<void> => {
    setBusy(true);
    try {
      await rememberJob(id);
      router.replace('/');
    } catch {
      toast.error('Could not save this job link. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen topInset>
      <Box flex={1} justifyContent="center" gap="400">
        <Text variant="h2">{valid ? 'Open shared job' : 'Invalid job link'}</Text>
        <Text variant="body">
          {!valid
            ? 'This link does not contain a valid job. Ask the sender to share it again.'
            : user?.role === 'CLIENT'
              ? 'Shared job listings are for usher accounts. Your current account hires staff.'
              : 'Sign in or finish your usher profile to view this job. We’ll keep the link while you continue.'}
        </Text>
        {valid && user?.role !== 'CLIENT' ? (
          <Button
            label={user ? 'Continue setup' : 'Sign in to view job'}
            loading={busy}
            onPress={() => {
              void open();
            }}
          />
        ) : null}
        <Button label="Go to HireQuick" variant="secondary" onPress={() => router.replace('/')} />
      </Box>
    </Screen>
  );
}
