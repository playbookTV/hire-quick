import { AvatarPicker } from '../../components/AvatarPicker.js';
import { TextArea } from '../../components/TextArea.js';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Button } from '../../components/Button.js';
import { Field } from '../../components/Field.js';
import { Input } from '../../components/Input.js';
import { Card } from '../../components/Card.js';
import { PreferenceRow } from '../../components/PreferenceRow.js';
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
  const [description, setDescription] = useState(user?.client?.description ?? '');
  const [position, setPosition] = useState(user?.client?.position ?? '');
  const [city, setCity] = useState(user?.client?.city ?? '');
  const [contactEmail, setContactEmail] = useState(user?.client?.contactEmail ?? '');
  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Account settings" showBack inset />
      <Screen scroll>
        <Box gap="400">
          <Text variant="accountHeading" accessibilityRole="header">
            Account settings
          </Text>
          <Box
            gap="100"
            paddingBottom="500"
            borderBottomWidth={1}
            borderBottomColor="borderDefault"
          >
            <Text variant="caption">Signed in as</Text>
            <Text variant="labelLg" fontSize={18} lineHeight={26}>
              {user?.phone}
            </Text>
          </Box>
          <Text variant="sectionTitle" accessibilityRole="header">
            Profile details
          </Text>
          {user?.role === 'CLIENT' ? (
            <>
              <AvatarPicker />
              <Field label="Full name">
                <Input
                  size="roomy"
                  accessibilityLabel="Full name"
                  value={name}
                  onChangeText={setName}
                  maxLength={120}
                  autoComplete="name"
                />
              </Field>
              {user.client?.accountType !== 'BUSINESS' ? (
                <Field label="Business name (optional)">
                  <Input
                    size="roomy"
                    accessibilityLabel="Business name (optional)"
                    value={business}
                    onChangeText={setBusiness}
                    maxLength={120}
                  />
                </Field>
              ) : (
                <Text variant="body">
                  {user.client.businessName ?? 'Business verification pending'}
                </Text>
              )}
              <Field label="About you / your company">
                <TextArea value={description} onChangeText={setDescription} maxLength={2000} />
              </Field>
              <Field label="Position / job title">
                <Input value={position} onChangeText={setPosition} maxLength={120} />
              </Field>
              <Field label="City / base area">
                <Input value={city} onChangeText={setCity} maxLength={80} />
              </Field>
              <Field
                label="Contact email"
                helper="Private account detail; not shown on your public profile."
              >
                <Input
                  value={contactEmail}
                  onChangeText={setContactEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  maxLength={254}
                />
              </Field>
              <Button
                size="xl"
                label={update.isPending ? 'Saving…' : 'Save profile'}
                disabled={update.isPending || name.trim().length < 2}
                onPress={() =>
                  update.mutate(
                    {
                      displayName: name.trim(),
                      description: description.trim(),
                      position: position.trim(),
                      city: city.trim(),
                      contactEmail: contactEmail.trim(),
                      ...(user.client?.accountType !== 'BUSINESS'
                        ? { businessName: business.trim() }
                        : {}),
                    },
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
          <Box gap="300" paddingTop="200">
            <Text variant="sectionTitle" accessibilityRole="header">
              Notifications & privacy
            </Text>
            <Card variant="borderless" padded={false}>
              <Box paddingHorizontal="400">
                <PreferenceRow
                  variant="navigation"
                  label="Notifications"
                  onPress={() => router.push('/(modals)/notification-settings')}
                />
                <Box height={1} backgroundColor="borderDefault" />
                <PreferenceRow
                  variant="navigation"
                  label="Privacy & data"
                  onPress={() => router.push('/(modals)/privacy-data')}
                />
                <Box height={1} backgroundColor="borderDefault" />
                <PreferenceRow
                  variant="navigation"
                  label="Privacy policy"
                  onPress={() => router.push('/privacy-policy')}
                />
              </Box>
            </Card>
          </Box>
        </Box>
      </Screen>
    </Box>
  );
}
