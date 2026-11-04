import { useRef, useState } from 'react';
import { Pressable } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { businessVerificationSchema } from '@hq/shared';
import { Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Button } from '../../components/Button.js';
import { Banner } from '../../components/Banner.js';
import { Input } from '../../components/Input.js';
import { Field } from '../../components/Field.js';
import { Chip } from '../../components/Chip.js';
import { Icon } from '../../components/Icon.js';
import { useAuth } from '../../lib/auth-context.js';
import { api } from '../../lib/client.js';
import { userMessage } from '../../lib/api-error.js';
import { pickImageAsset } from '../../lib/upload.js';
import { transferUpload } from '../../lib/upload-transfer.js';

export default function BusinessVerification() {
  const { user, refreshMe } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const lock = useRef(false);
  const [registeredName, setName] = useState('');
  const [registrationNumber, setNumber] = useState('');
  const [businessType, setType] = useState<'co' | 'bn' | 'it'>('co');
  const [representativeRole, setRole] = useState('');
  const [authorizationKey, setKey] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  if (
    user?.role !== 'CLIENT' ||
    user.client?.accountType !== 'BUSINESS' ||
    user.client.verificationStatus !== 'VERIFIED'
  )
    return <Redirect href="/" />;
  const body = {
    registeredName,
    registrationNumber,
    businessType,
    representativeRole,
    authorizationKey,
    authorized,
  };
  async function upload() {
    if (lock.current) return;
    lock.current = true;
    setUploading(true);
    setError('');
    try {
      const asset = await pickImageAsset('library');
      if (!asset) return;
      const contentType = asset.mimeType ?? 'image/jpeg';
      const key = await transferUpload(
        '/api/me/verification/business/upload-url',
        { contentType },
        contentType,
        asset,
        api.post,
      );
      setKey(key);
    } catch (e) {
      setError(userMessage(e));
    } finally {
      lock.current = false;
      setUploading(false);
    }
  }
  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await api.post('/api/me/verification/business', businessVerificationSchema.parse(body));
      await queryClient.invalidateQueries({ queryKey: ['business-verification'] });
      await refreshMe();
      router.replace('/(verification)/client-verification');
    } catch (e) {
      setError(userMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Business verification" showBack inset />
      <Screen scroll>
        <Box style={{ gap: 20 }}>
          <Text variant="h1">Verify your business</Text>
          <Field label="Registered business name">
            <Input
              value={registeredName}
              onChangeText={setName}
              maxLength={160}
              editable={!busy}
              autoCapitalize="words"
            />
          </Field>
          <Text variant="label">Registration type</Text>
          <Box flexDirection="row" flexWrap="wrap" style={{ gap: 8 }}>
            {(
              [
                ['co', 'Company'],
                ['bn', 'Business name'],
                ['it', 'Incorporated trustees'],
              ] as const
            ).map(([value, label]) => (
              <Chip
                key={value}
                label={label}
                selected={businessType === value}
                disabled={busy}
                onPress={() => setType(value)}
              />
            ))}
          </Box>
          <Field label="CAC registration number">
            <Input
              value={registrationNumber}
              onChangeText={setNumber}
              maxLength={40}
              editable={!busy}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </Field>
          <Field label="Your role">
            <Input
              placeholder="e.g. Director or Events manager"
              value={representativeRole}
              onChangeText={setRole}
              maxLength={100}
              editable={!busy}
            />
          </Field>
          <Field
            label="Proof you can represent the business"
            helper="Upload a clear photo of a signed authorisation letter or registry document naming you as a director or proprietor."
          >
            <Button
              variant="secondary"
              label={authorizationKey ? 'Replace uploaded evidence' : 'Upload evidence photo'}
              loading={uploading}
              disabled={busy}
              onPress={() => void upload()}
            />
            {authorizationKey ? (
              <Text variant="bodySm" color="brandEmerald">
                Evidence uploaded
              </Text>
            ) : null}
          </Field>
          <Pressable
            accessibilityRole="checkbox"
            aria-checked={authorized}
            accessibilityState={{ checked: authorized, disabled: busy }}
            disabled={busy}
            onPress={() => setAuthorized(!authorized)}
            style={{ flexDirection: 'row', gap: 12, minHeight: 44, alignItems: 'center' }}
          >
            <Icon name={authorized ? 'check-square' : 'square'} size={24} />
            <Text variant="bodySm" style={{ flex: 1 }}>
              I am authorised to represent this business and consent to its registration being
              checked.
            </Text>
          </Pressable>
          {error ? <Banner tone="warning" message={error} /> : null}
          <Button
            label="Submit for verification"
            disabled={!businessVerificationSchema.safeParse(body).success || uploading}
            loading={busy}
            onPress={() => void submit()}
          />
        </Box>
      </Screen>
    </Box>
  );
}
