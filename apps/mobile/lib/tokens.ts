/** One atomic keychain envelope; a logout tombstone prevents legacy resurrection. */
import * as SecureStore from 'expo-secure-store';
import { createSessionStore, type TokenPair } from './session-store.js';
import { createSessionKeychain } from './session-keychain.js';

export const sessionStore = createSessionStore(createSessionKeychain(SecureStore));

export type { TokenPair } from './session-store.js';
export async function getTokens(): Promise<TokenPair | null> { return (await sessionStore.snapshot()).tokens; }
export async function saveTokens(pair: TokenPair): Promise<void> { await sessionStore.replace(pair); }
export async function clearTokens(): Promise<void> { await sessionStore.end().completion; }
