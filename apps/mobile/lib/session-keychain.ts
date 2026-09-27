/** Storage adapter kept separate so legacy migration can be tested without native imports. */
export function createSessionKeychain(keychain: {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}) {
  const sessionKey = 'hq.session';
  const accessKey = 'hq.access';
  const refreshKey = 'hq.refresh';
  return {
    async read(): Promise<string | null> {
      const current = await keychain.getItemAsync(sessionKey);
      if (current !== null) return current;
      const [accessToken, refreshToken] = await Promise.all([
        keychain.getItemAsync(accessKey), keychain.getItemAsync(refreshKey),
      ]);
      return JSON.stringify({ version: 1, tokens: accessToken && refreshToken ? { accessToken, refreshToken } : null });
    },
    async write(value: string): Promise<void> {
      await keychain.setItemAsync(sessionKey, value);
      // The atomic envelope is authoritative even if legacy cleanup fails.
      await Promise.allSettled([keychain.deleteItemAsync(accessKey), keychain.deleteItemAsync(refreshKey)]);
    },
  };
}
