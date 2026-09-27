import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Button } from '../../components/Button.js';
import { Field } from '../../components/Field.js';
import { Input } from '../../components/Input.js';
import { useAuth } from '../../lib/auth-context.js';
import { useUpdateProfile } from '../../lib/hooks.js';
import { useToast } from '../../lib/toast.js';
import { userMessage } from '../../lib/api-error.js';
export default function AccountSettings(): React.JSX.Element {
  const { user, refreshMe } = useAuth();
  const router = useRouter();
  const update = useUpdateProfile();
  const toast = useToast();
  const [name, setName] = useState(user?.client?.displayName ?? '');
  const [business, setBusiness] = useState(user?.client?.businessName ?? '');
  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Account settings" showBack inset />
      <Screen scroll>
        <Box style={{ gap: 20 }}>
          <Text variant="bodySm" color="inkMuted">
            Signed in as {user?.phone}
          </Text>
          {user?.role === 'CLIENT' ? (
            <>
              <Field label="Full name">
                <Input value={name} onChangeText={setName} maxLength={120} />
              </Field>
              <Field label="Business name (optional)">
                <Input value={business} onChangeText={setBusiness} maxLength={120} />
              </Field>
              <Button
                label={update.isPending ? 'Saving…' : 'Save profile'}
                disabled={update.isPending || name.trim().length < 2}
                onPress={() =>
                  update.mutate(
                    { displayName: name.trim(), businessName: business.trim() },
                    {
                      onError: (e) => toast.error(userMessage(e)),
                      onSuccess: () => {
                        void refreshMe().then(() => toast.success('Profile saved.'));
                      },
                    },
                  )
                }
              />
            </>
          ) : (
            <Button label="Edit profile" onPress={() => router.push('/(modals)/edit-profile')} />
          )}
          <Button
            label="Privacy & data"
            variant="secondary"
            onPress={() => router.push('/(modals)/privacy-data')}
          />
          <Button
            label="Privacy policy"
            variant="secondary"
            onPress={() => router.push('/privacy-policy')}
          />
        </Box>
      </Screen>
    </Box>
  );
}
