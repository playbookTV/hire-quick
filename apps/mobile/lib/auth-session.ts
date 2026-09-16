import { SessionChanged, type SessionStore, type TokenPair } from './session-store.js';
import { assertNotAborted } from './abort.js';

export type AuthState<User> = {
  status: 'loading' | 'authed' | 'guest' | 'unavailable';
  user: User | null;
  problem: 'restore' | 'logout' | null;
};

/** Lifecycle coordinator; all user/cache publication is tied to the current login. */
export function createAuthSession<User>(deps: {
  sessions: SessionStore;
  fetchMe(signal: AbortSignal): Promise<User>;
  revoke(refreshToken: string): Promise<void>;
  publish(user: User | null): void;
  timeoutMs?: number;
}) {
  let state: AuthState<User> = { status: 'loading', user: null, problem: null };
  let operation = 0;
  let profileRun = 0;
  const controllers = new Set<AbortController>();
  const listeners = new Set<() => void>();
  const setState = (next: AuthState<User>): void => {
    state = next;
    for (const listener of listeners) listener();
  };
  const cancel = (): number => {
    operation += 1;
    for (const controller of controllers) controller.abort();
    return operation;
  };
  const current = (run: number, generation: number): boolean => run === operation && deps.sessions.isCurrent(generation);
  const bounded = async <T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const controller = new AbortController();
    controllers.add(controller);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work(controller.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error('Session check timed out')); }, deps.timeoutMs ?? 8000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      controllers.delete(controller);
    }
  };
  const publish = (user: User | null): void => {
    deps.publish(user);
    setState({ status: user ? 'authed' : 'guest', user, problem: null });
  };
  return {
    getSnapshot: () => state,
    subscribe(this: void, listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose(this: void): void { cancel(); },
    invalidated(this: void, generation: number, persistenceFailed: boolean): void {
      if (!deps.sessions.isCurrent(generation)) return;
      cancel();
      deps.publish(null);
      setState({ status: persistenceFailed ? 'unavailable' : 'guest', user: null, problem: persistenceFailed ? 'logout' : null });
    },
    async restore(this: void): Promise<void> {
      const run = cancel();
      const generation = deps.sessions.generation();
      setState({ status: 'loading', user: null, problem: null });
      try {
        const user = await bounded(async (signal) => {
          const snapshot = await deps.sessions.snapshot();
          if (!current(run, generation)) throw new SessionChanged();
          assertNotAborted(signal);
          return snapshot.tokens ? deps.fetchMe(signal) : null;
        });
        if (current(run, generation)) publish(user);
      } catch {
        if (current(run, generation)) {
          deps.publish(null);
          setState({ status: 'unavailable', user: null, problem: 'restore' });
        }
      }
    },
    async login(this: void, pair: TokenPair): Promise<User> {
      const run = cancel();
      const saving = deps.sessions.replace(pair);
      const generation = deps.sessions.generation();
      deps.publish(null);
      setState({ status: 'loading', user: null, problem: null });
      try {
        const user = await bounded(async (signal) => {
          await saving;
          if (!current(run, generation)) throw new SessionChanged();
          assertNotAborted(signal);
          return deps.fetchMe(signal);
        });
        if (!current(run, generation)) throw new SessionChanged();
        publish(user);
        return user;
      } catch (error) {
        if (current(run, generation)) setState({ status: 'unavailable', user: null, problem: 'restore' });
        throw error;
      }
    },
    async logout(this: void): Promise<void> {
      const run = cancel();
      // Fence before awaiting anything; the captured pair belongs to this logout.
      const ended = deps.sessions.end();
      deps.publish(null);
      setState({ status: 'loading', user: null, problem: null });
      const revoking = ended.tokens ? deps.revoke(ended.tokens.refreshToken).catch(() => undefined) : Promise.resolve();
      try {
        await ended.completion;
        if (current(run, ended.generation)) publish(null);
      } catch {
        if (current(run, ended.generation)) setState({ status: 'unavailable', user: null, problem: 'logout' });
      }
      await revoking;
    },
    async refreshMe(this: void): Promise<User | null> {
      const run = operation;
      const generation = deps.sessions.generation();
      const profile = ++profileRun;
      try {
        const user = await bounded((signal) => deps.fetchMe(signal));
        if (!current(run, generation) || profile !== profileRun) return null;
        publish(user);
        return user;
      } catch { return null; }
    },
  };
}
