import { z } from 'zod';

export const tokenPairSchema = z.object({ accessToken: z.string().min(1), refreshToken: z.string().min(1) });
export type TokenPair = z.infer<typeof tokenPairSchema>;
const envelopeSchema = z.object({ version: z.literal(1), tokens: tokenPairSchema.nullable() });
export type SessionSnapshot = { generation: number; tokens: TokenPair | null };
export class SessionChanged extends Error {
  constructor() { super('The signed-in session changed.'); }
}

export function createSessionStore(storage: { read(): Promise<string | null>; write(value: string): Promise<void> }) {
  let generation = 0;
  let loaded = false;
  let tokens: TokenPair | null = null;
  let dirty = false;
  let tail = Promise.resolve();
  const queue = <T>(work: () => Promise<T>): Promise<T> => {
    const result = tail.then(work);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
  const assertCurrent = (expected: number): void => {
    if (generation !== expected) throw new SessionChanged();
  };
  const persist = async (expected: number): Promise<void> => {
    assertCurrent(expected);
    await storage.write(JSON.stringify({ version: 1, tokens }));
    assertCurrent(expected);
    dirty = false;
  };
  return {
    generation: () => generation,
    isCurrent: (expected: number) => generation === expected,
    async snapshot(): Promise<SessionSnapshot> {
      const expected = generation;
      return queue(async () => {
        assertCurrent(expected);
        if (!loaded) {
          const raw = await storage.read();
          assertCurrent(expected);
          tokens = raw === null ? null : envelopeSchema.parse(JSON.parse(raw)).tokens;
          loaded = true;
          dirty = raw !== null;
        }
        if (dirty) await persist(expected);
        return { generation: expected, tokens: tokens ? { ...tokens } : null };
      });
    },
    replace(pair: TokenPair): Promise<SessionSnapshot> {
      const expected = ++generation;
      tokens = tokenPairSchema.parse(pair);
      loaded = true;
      dirty = true;
      return queue(async () => {
        await persist(expected);
        return { generation: expected, tokens: { ...pair } };
      });
    },
    update(snapshot: SessionSnapshot, pair: TokenPair): Promise<TokenPair> {
      return queue(async () => {
        assertCurrent(snapshot.generation);
        if (!tokens || tokens.refreshToken !== snapshot.tokens?.refreshToken) throw new SessionChanged();
        // A keychain failure retains the rotated pair in memory; a later snapshot
        // retries persistence instead of reusing the consumed refresh token.
        tokens = tokenPairSchema.parse(pair);
        dirty = true;
        await persist(snapshot.generation);
        return { ...pair };
      });
    },
    end(expected?: number): { generation: number; tokens: TokenPair | null; completion: Promise<void> } {
      if (expected !== undefined) assertCurrent(expected);
      const captured = tokens ? { ...tokens } : null;
      const next = ++generation;
      tokens = null;
      loaded = true;
      dirty = true;
      return { generation: next, tokens: captured, completion: queue(() => persist(next)) };
    },
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;
