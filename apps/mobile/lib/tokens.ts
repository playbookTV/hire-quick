/**
 * Access + refresh JWTs persisted in the device keychain (expo-secure-store).
 * The API uses short-lived access tokens with rotating refresh tokens, so we
 * always overwrite the pair together.
 */
import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'hq.access';
const REFRESH_KEY = 'hq.refresh';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export async function getTokens(): Promise<TokenPair | null> {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ]);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export async function saveTokens(pair: TokenPair): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, pair.accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, pair.refreshToken),
  ]);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]);
}
