/**
 * AvatarPicker — the usher's editable profile photo. Taps open the library,
 * upload via the presigned-key flow (lib/upload), then refresh `me` so the new
 * photo shows immediately. Falls back to gradient initials when none is set.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { useTheme, Box } from '../theme/restyle.js';
import { Avatar } from './Avatar.js';
import { Icon } from './Icon.js';
import { useAuth } from '../lib/auth-context.js';
import { useSetAvatar } from '../lib/hooks.js';
import { useToast } from '../lib/toast.js';
import { pickImageAsset, uploadUsherPhoto } from '../lib/upload.js';

export function AvatarPicker({ size = 96 }: { size?: number }): React.JSX.Element {
  const theme = useTheme();
  const { user, refreshMe } = useAuth();
  const setAvatar = useSetAvatar();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const usher = user?.usher ?? null;
  const badge = Math.max(22, Math.round(size * 0.3));

  const onPick = async (): Promise<void> => {
    if (busy) return;
    try {
      const asset = await pickImageAsset('library');
      if (!asset) return;
      setBusy(true);
      const key = await uploadUsherPhoto('avatar', asset);
      await setAvatar.mutateAsync(key);
      await refreshMe();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Please try again.', 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable onPress={() => void onPick()} accessibilityLabel="Change profile photo">
      <Box style={{ width: size, height: size }}>
        <Avatar name={usher?.displayName} size={size} imageUrl={usher?.avatarUrl} />
        {/* camera badge */}
        <Box
          style={{
            position: 'absolute',
            right: -2,
            bottom: -2,
            width: badge,
            height: badge,
            borderRadius: badge / 2,
            backgroundColor: theme.colors.brandEmerald,
            borderWidth: 2,
            borderColor: theme.colors.bgCanvas,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="camera" size={Math.round(badge * 0.5)} color="bgCanvas" />
        </Box>
        {busy ? (
          <Box
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: size,
              height: size,
              borderRadius: size / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0,0,0,0.35)',
            }}
          >
            <ActivityIndicator color="#fff" />
          </Box>
        ) : null}
      </Box>
    </Pressable>
  );
}
