/**
 * Usher home — greeting, verification gate, and a stats glance. Applying to jobs
 * is locked until the usher is VERIFIED (mirrors the API's `verifiedUsherFor`).
 */
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Banner } from '../../components/Banner.js';
import { Button } from '../../components/Button.js';
import { StatCard } from '../../components/StatCard.js';
import { Box, Text } from '../../theme/restyle.js';
import { useAuth } from '../../lib/auth-context.js';

export default function UsherHome(): React.JSX.Element {
  const { user } = useAuth();
  const usher = user?.usher;
  const verified = usher?.verificationStatus === 'VERIFIED';
  const rejected = usher?.verificationStatus === 'REJECTED';

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Home" inset />
      <Screen scroll>
        <Text variant="h1">Welcome back 👋</Text>
        <Text variant="body" color="inkMuted" marginTop="150" marginBottom="500">
          Here’s where your gigs and earnings will live.
        </Text>

        {!verified ? (
          <Box marginBottom="500" gap="300">
            <Banner
              tone={rejected ? 'warning' : 'brand'}
              title={rejected ? 'Verification was rejected' : 'Verify your identity'}
              message={
                rejected
                  ? 'Re-submit your ID and a selfie to start applying to jobs.'
                  : 'Submit your ID and a selfie to unlock job applications and payouts.'
              }
            />
            <Button
              label={rejected ? 'Re-submit verification' : 'Start verification'}
              variant="secondary"
              onPress={() => {
                /* Verification flow lands in a later phase. */
              }}
            />
          </Box>
        ) : null}

        <Box flexDirection="row" gap="300" marginBottom="500">
          <StatCard value={String(usher?.completedJobsCount ?? 0)} label="Jobs completed" />
          <StatCard
            value={usher?.ratingAvg ? usher.ratingAvg.toFixed(1) : '—'}
            label="Average rating"
          />
        </Box>

        <Box
          backgroundColor="bgMuted"
          borderRadius="lg"
          padding="500"
          alignItems="center"
        >
          <Text variant="title" style={{ textAlign: 'center' }}>
            {verified ? 'You’re all set' : 'Get verified to start'}
          </Text>
          <Text variant="bodySm" color="inkMuted" marginTop="150" style={{ textAlign: 'center' }}>
            {verified
              ? 'Browse open jobs from the Jobs tab and apply in a tap.'
              : 'Once verified, open jobs will appear here and in the Jobs tab.'}
          </Text>
        </Box>
      </Screen>
    </Box>
  );
}
