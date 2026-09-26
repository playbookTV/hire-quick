import { z } from 'zod';
import type { CheckoutStorage } from './checkout.js';

const manifestSchema = z.object({ version: z.literal(1), revision: z.string().regex(/^[a-zA-Z0-9_-]+$/), chunks: z.number().int().min(1).max(100) });
interface Keychain {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}
/** Publish immutable small chunks with one atomic manifest; serialize readers and cleanup per scope. */
export function checkoutStorage(keychain: Keychain, revision: () => string, namespace = 'hq.checkout'): CheckoutStorage {
  const tails = new Map<string, Promise<unknown>>();
  const key = (scope: string): string => `${namespace}.${scope}`;
  const serialized = <T>(scope: string, work: () => Promise<T>): Promise<T> => {
    const result = (tails.get(scope) ?? Promise.resolve()).catch(() => undefined).then(work);
    tails.set(scope, result);
    void result.finally(() => { if (tails.get(scope) === result) tails.delete(scope); }).catch(() => undefined);
    return result;
  };
  const cleanup = async (prefix: string, manifest: z.infer<typeof manifestSchema>): Promise<void> => {
    await Promise.allSettled(Array.from({ length: manifest.chunks }, (_, i) => keychain.deleteItemAsync(`${prefix}.${manifest.revision}.${i}`)));
  };
  return {
    read: (scope) => serialized(scope, async () => {
      const raw = await keychain.getItemAsync(key(scope));
      if (raw === null) return null;
      const manifest = manifestSchema.parse(JSON.parse(raw));
      let value = '';
      for (let i = 0; i < manifest.chunks; i++) {
        const part = await keychain.getItemAsync(`${key(scope)}.${manifest.revision}.${i}`);
        if (part === null) throw new Error('Saved data is incomplete.');
        value += part;
      }
      return value;
    }),
    write: (scope, value) => serialized(scope, async () => {
      const prefix = key(scope);
      const oldRaw = await keychain.getItemAsync(prefix);
      const old = oldRaw === null ? null : manifestSchema.parse(JSON.parse(oldRaw));
      // At most 500 UTF-16 code units per value, without splitting emoji surrogate
      // pairs at a native keychain boundary. Each chunk stays below 2 KB UTF-8.
      const chunks: string[] = [];
      let chunk = '';
      for (const character of value) {
        if (chunk.length + character.length > 500) { chunks.push(chunk); chunk = ''; }
        chunk += character;
      }
      if (chunk) chunks.push(chunk);
      const manifest = manifestSchema.parse({ version: 1, revision: revision(), chunks: chunks.length });
      // If manifest publication fails ambiguously, retain new chunks so either
      // the old or newly committed manifest remains readable on restart.
      for (const [i, part] of chunks.entries()) await keychain.setItemAsync(`${prefix}.${manifest.revision}.${i}`, part);
      await keychain.setItemAsync(prefix, JSON.stringify(manifest));
      if (old) await cleanup(prefix, old);
    }),
    remove: (scope) => serialized(scope, async () => {
      const prefix = key(scope);
      const raw = await keychain.getItemAsync(prefix);
      const old = raw === null ? null : manifestSchema.parse(JSON.parse(raw));
      await keychain.deleteItemAsync(prefix);
      if (old) await cleanup(prefix, old);
    }),
  };
}
