import { useQuery, useMutation } from '@tanstack/react-query';
import { Box, Text } from '../theme/restyle.js';
import { Screen } from '../components/Screen.js';
import { AppBar } from '../components/AppBar.js';
import { Button } from '../components/Button.js';
import { QueryState } from '../components/QueryState.js';
import { api } from '../lib/client.js';
import { useAuth } from '../lib/auth-context.js';
import { useToast } from '../lib/toast.js';
import { userMessage } from '../lib/api-error.js';
export default function PrivacyPolicy(): React.JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const query = useQuery({
    queryKey: ['privacy-policy'],
    queryFn: () =>
      api.get<{ version: string; effectiveDate: string; body: string }>(
        '/api/legal/privacy-policy',
        { auth: false },
      ),
  });
  const accept = useMutation({
    mutationFn: () => api.post<{ version: string }>('/api/legal/privacy-policy/accept'),
    onError: (e) => toast.error(userMessage(e)),
    onSuccess: () => toast.success('Acknowledgement recorded.'),
  });
  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Privacy policy" showBack inset />
      <Screen scroll>
        <QueryState query={query}>
          {(policy) => (
            <Box style={{ gap: 16 }}>
              <Text variant="bodySm" color="inkMuted">
                Version {policy.version} · Effective {policy.effectiveDate}
              </Text>
              <Box>
                {policy.body.split('\n\n').map((p, i, paragraphs) => (
                  <Text
                    key={i}
                    variant={p.startsWith('#') ? 'h2' : 'body'}
                    accessibilityRole={p.startsWith('#') ? 'header' : undefined}
                    marginTop={
                      i === 0 ? 'none' : paragraphs[i - 1]?.startsWith('#') ? '150' : '400'
                    }
                  >
                    {p.replace(/^#+\s*/, '')}
                  </Text>
                ))}
              </Box>
              {user ? (
                <Button
                  label={accept.isSuccess ? 'Acknowledged' : 'Acknowledge policy'}
                  disabled={accept.isPending || accept.isSuccess}
                  onPress={() => accept.mutate()}
                />
              ) : null}
            </Box>
          )}
        </QueryState>
      </Screen>
    </Box>
  );
}
