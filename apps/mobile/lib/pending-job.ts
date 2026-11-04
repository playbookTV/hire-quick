import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { pendingJobId, validJobId } from './job-links.js';

const KEY = 'hirequick.pending-job';
export async function rememberJob(id: string): Promise<void> {
  if (!validJobId(id)) throw new Error('This job link is invalid.');
  const value = JSON.stringify({ id, savedAt: Date.now() });
  if (Platform.OS === 'web') globalThis.sessionStorage.setItem(KEY, value);
  else await SecureStore.setItemAsync(KEY, value);
}
export async function readPendingJob(): Promise<string | null> {
  return pendingJobId(
    Platform.OS === 'web'
      ? globalThis.sessionStorage.getItem(KEY)
      : await SecureStore.getItemAsync(KEY),
  );
}
export async function clearPendingJob(): Promise<void> {
  if (Platform.OS === 'web') globalThis.sessionStorage.removeItem(KEY);
  else await SecureStore.deleteItemAsync(KEY);
}
