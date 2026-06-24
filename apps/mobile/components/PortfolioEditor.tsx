/**
 * PortfolioEditor — the usher's editable work-photos grid (max 5). Clients see
 * these when deciding whom to hire. Adds/removes via the presigned-key flow,
 * then refresh `me` so the grid updates immediately.
 */
import { useState } from 'react';
import { ActivityIndicator, Alert } from 'react-native';
import { useTheme, Box } from '../theme/restyle.js';
import { AddPhoto } from './AddPhoto.js';
import { useAuth } from '../lib/auth-context.js';
import { useAddPortfolioPhoto, useDeletePortfolioPhoto } from '../lib/hooks.js';
import { pickImageAsset, uploadUsherPhoto } from '../lib/upload.js';
import { MAX_PORTFOLIO_PHOTOS } from '@hq/shared';

export function PortfolioEditor(): React.JSX.Element {
  const theme = useTheme();
  const { user, refreshMe } = useAuth();
  const add = useAddPortfolioPhoto();
  const remove = useDeletePortfolioPhoto();
  const [busy, setBusy] = useState(false);
  const photos = user?.usher?.portfolio ?? [];

  const onAdd = async (): Promise<void> => {
    if (busy) return;
    try {
      const asset = await pickImageAsset('library');
      if (!asset) return;
      setBusy(true);
      const key = await uploadUsherPhoto('portfolio', asset);
      await add.mutateAsync(key);
      await refreshMe();
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (id: string): Promise<void> => {
    try {
      await remove.mutateAsync(id);
      await refreshMe();
    } catch (e) {
      Alert.alert('Couldn’t remove photo', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  return (
    <Box flexDirection="row" flexWrap="wrap" style={{ gap: 12 }}>
      {photos.map((p) => (
        <AddPhoto key={p.id} variant="tile" imageUrl={p.imageUrl} onRemove={() => void onRemove(p.id)} />
      ))}
      {busy ? (
        <Box
          style={{
            width: 80,
            height: 80,
            borderRadius: theme.borderRadii.md,
            backgroundColor: theme.colors.bgSubtle,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ActivityIndicator color={theme.colors.brandEmerald} />
        </Box>
      ) : null}
      {photos.length < MAX_PORTFOLIO_PHOTOS && !busy ? (
        <AddPhoto variant="tile" onPress={() => void onAdd()} />
      ) : null}
    </Box>
  );
}
