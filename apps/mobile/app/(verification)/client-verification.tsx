import { useEffect, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { clientCanHire } from '@hq/shared';
import { Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Button } from '../../components/Button.js';
import { Banner } from '../../components/Banner.js';
import { Badge } from '../../components/Badge.js';
import { useAuth } from '../../lib/auth-context.js';
import { useMyVerifications } from '../../lib/hooks.js';
import { api } from '../../lib/client.js';
import { openSupport } from '../../lib/support.js';
import { userMessage } from '../../lib/api-error.js';

export default function ClientVerification() {
  const { user, refreshMe, logout } = useAuth();
  const router = useRouter();
  const identity = useMyVerifications();
  const business = useQuery({
    queryKey: ['business-verification'],
    queryFn: () =>
      api.get<{
        verification: { status: string; registryStatus: string; reviewNote: string | null } | null;
      }>('/api/me/verification/business'),
    enabled: user?.client?.accountType === 'BUSINESS',
    refetchInterval: 20_000,
  });
  const [error, setError] = useState('');
  useEffect(() => {
    void refreshMe().catch(() => setError('Could not refresh your account. Try again.'));
  }, [identity.dataUpdatedAt, business.dataUpdatedAt, refreshMe]);
  if (user?.role !== 'CLIENT') return <Redirect href="/" />;
  if (!user.client?.accountType) return <Redirect href="/(verification)/account-type" />;
  if (clientCanHire(user.client)) return <Redirect href="/(client)/home" />;
  const verified = user.client.verificationStatus === 'VERIFIED';
  const attempt = identity.data?.[0];
  const received = attempt?.status === 'PENDING' && !!attempt.govLookup?.providerStatus;
  const needsReview = ['attention', 'error'].includes(attempt?.govLookup?.providerStatus ?? '');
  const businessAttempt = business.data?.verification;
  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Complete verification" inset />
      <Screen scroll>
        <Box style={{ gap: 20 }}>
          <Text variant="h1">Verify your account</Text>
          <Text variant="body" color="inkMuted">
            Complete the checks below to start hiring on HireQuick.
          </Text>
          <Text variant="titleM">Your identity</Text>
          {verified ? (
            <Badge label="Identity verified" />
          ) : (
            <>
              <Text variant="body">
                {attempt?.status === 'PENDING'
                  ? received
                    ? needsReview
                      ? 'Your identity check needs review. Contact support for help.'
                      : 'Your identity check has been received and is being processed.'
                    : 'We are waiting for your identity result. If you left the camera check before submitting, complete it to continue.'
                  : attempt?.status === 'REJECTED'
                    ? (attempt.reason ??
                      'Your identity check did not pass. Confirm your details and try again.')
                    : 'Confirm your Nigerian ID and take a live selfie with Smile ID.'}
              </Text>
              {identity.isError ? (
                <Banner
                  tone="warning"
                  message="Could not load your identity check. Refresh to try again."
                />
              ) : null}
              {!received ? (
                <Button
                  label={
                    attempt?.status === 'PENDING' ? 'Continue identity check' : 'Verify identity'
                  }
                  onPress={() => router.push('/(verification)/id-verification')}
                />
              ) : null}
            </>
          )}
          {user.client.accountType === 'BUSINESS' ? (
            <>
              <Box height={1} backgroundColor="borderDefault" />
              <Text variant="titleM">Your business</Text>
              <Text variant="body" color="inkMuted">
                {!verified
                  ? 'Available after your identity is verified.'
                  : businessAttempt?.status === 'PENDING'
                    ? businessAttempt.registryStatus === 'VERIFIED'
                      ? 'Registration checked. Our team is reviewing your authority to represent the business.'
                      : businessAttempt.registryStatus === 'PROCESSING'
                        ? 'Your business registration check is in progress.'
                        : 'We could not confirm your business registration. Contact support for help.'
                    : businessAttempt?.status === 'REJECTED'
                      ? (businessAttempt.reviewNote ??
                        'Update your business evidence and resubmit.')
                      : 'Submit your registration details and evidence that you can represent this business.'}
              </Text>
              {business.isError ? (
                <Banner
                  tone="warning"
                  message="Could not load your business check. Refresh to try again."
                />
              ) : null}
              {businessAttempt?.status !== 'PENDING' ? (
                <Button
                  label="Verify business"
                  disabled={!verified || business.isLoading || business.isError}
                  onPress={() => router.push('/(verification)/business-verification')}
                />
              ) : null}
            </>
          ) : null}
          {error ? <Banner tone="warning" message={error} /> : null}
          <Button
            label="Refresh status"
            variant="secondary"
            onPress={() => {
              setError('');
              void Promise.all([
                identity.refetch(),
                ...(user.client?.accountType === 'BUSINESS' ? [business.refetch()] : []),
                refreshMe(),
              ]).catch((e) => setError(userMessage(e)));
            }}
          />
          <Button
            label="Manage existing paid bookings"
            variant="ghost"
            onPress={() => router.push('/(modals)/my-bookings')}
          />
          <Button
            label="Contact support"
            variant="ghost"
            onPress={() => {
              void openSupport('Please help me complete my client account verification.');
            }}
          />
          <Button
            label="Privacy and account data"
            variant="ghost"
            onPress={() => router.push('/(modals)/privacy-data')}
          />
          <Button
            label="Sign out"
            variant="ghost"
            onPress={() => {
              void logout().catch((e) => setError(userMessage(e)));
            }}
          />
        </Box>
      </Screen>
    </Box>
  );
}
