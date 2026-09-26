import { z } from 'zod';
import type { Message } from './types.js';

export interface MessagePage {
  items: Message[];
  hasMore: boolean;
  oldestCursor: string | null;
  newestCursor: string | null;
  receipts: Array<{ id: string; seenAt: string }>;
}
const pendingSchema = z.object({
  clientMessageId: z.string().uuid(),
  content: z.string().min(1).max(4000),
  contentType: z.enum(['TEXT', 'IMAGE', 'VOICE']),
  createdAt: z.string().datetime(),
});
export type PendingMessage = z.infer<typeof pendingSchema>;
interface Storage {
  read(scope: string): Promise<string | null>;
  write(scope: string, value: string): Promise<void>;
  remove(scope: string): Promise<void>;
}
export interface ChatState {
  messages: Message[];
  pending: PendingMessage[];
  sending: string[];
  ready: boolean;
  loadingOlder: boolean;
  hasOlder: boolean;
  error: string | null;
}

/** Merge by server ID, retaining read receipts when an older response arrives. */
export function mergeMessages(
  current: Message[],
  incoming: Message[],
  receipts: MessagePage['receipts'] = [],
): Message[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const old = byId.get(message.id);
    byId.set(message.id, { ...message, seenAt: message.seenAt ?? old?.seenAt ?? null });
  }
  for (const receipt of receipts) {
    const message = byId.get(receipt.id);
    if (message) byId.set(message.id, { ...message, seenAt: receipt.seenAt });
  }
  return [...byId.values()].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

/** One user/booking instance. Only explicit send/retry dispatches saved messages;
 * restoring history never sends on behalf of a newly signed-in account. */
export function createChatController(deps: {
  userId: string;
  bookingId: string;
  storage: Storage;
  makeId(): string;
  page(query: URLSearchParams, signal: AbortSignal): Promise<MessagePage>;
  send(input: PendingMessage, signal: AbortSignal): Promise<Message>;
  isCurrent(): boolean;
}) {
  const scope = `${deps.userId}.${deps.bookingId}`;
  let state: ChatState = {
    messages: [],
    pending: [],
    sending: [],
    ready: false,
    loadingOlder: false,
    hasOlder: false,
    error: null,
  };
  const listeners = new Set<() => void>();
  const abort = new AbortController();
  let disposed = false;
  let newest: string | null = null;
  let oldest: string | null = null;
  let hydrated: Promise<void> | undefined;
  let syncing: Promise<void> | undefined;
  let saving = Promise.resolve();
  const live = () => !disposed && deps.isCurrent();
  const check = () => {
    if (!live()) throw new Error('This chat session has ended.');
  };
  const request = async <T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    check();
    const attempt = new AbortController();
    const cancel = () => attempt.abort();
    abort.signal.addEventListener('abort', cancel, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work(attempt.signal),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            attempt.abort();
            reject(new Error('Connection timed out. Your unconfirmed messages can be retried.'));
          }, 15_000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      abort.signal.removeEventListener('abort', cancel);
    }
  };
  const publish = (patch: Partial<ChatState>) => {
    if (!live()) return;
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const report = (error: unknown) =>
    publish({
      error: error instanceof Error ? error.message : 'Couldn’t update this conversation.',
    });
  const persist = () => {
    const value = JSON.stringify(state.pending);
    const result = saving.catch(() => undefined).then(() => deps.storage.write(scope, value));
    saving = result;
    return result;
  };
  const hydrate = () =>
    (hydrated ??= (async () => {
      const raw = await deps.storage.read(scope);
      check();
      publish({ pending: raw ? z.array(pendingSchema).max(8).parse(JSON.parse(raw)) : [] });
    })().catch((error: unknown) => {
      hydrated = undefined;
      throw error;
    }));
  const merge = (page: MessagePage) =>
    publish({ messages: mergeMessages(state.messages, page.items, page.receipts) });
  const reconcilePending = async () => {
    const confirmed = new Set(
      state.messages
        .filter((message) => message.senderId === deps.userId)
        .map((message) => message.id),
    );
    const pending = state.pending.filter((message) => !confirmed.has(message.clientMessageId));
    if (pending.length !== state.pending.length) {
      publish({ pending });
      await persist();
    }
  };
  const sync = (): Promise<void> => {
    if (syncing) return syncing;
    syncing = (async () => {
      await hydrate();
      check();
      // Bounded batches catch up a long disconnect without one huge response.
      for (let batch = 0; batch < 10; batch++) {
        const query = new URLSearchParams({ limit: '50' });
        const after = newest;
        if (after) query.set('after', after);
        const unread = state.messages
          .filter((message) => message.senderId === deps.userId && !message.seenAt)
          .slice(0, 100);
        if (unread.length) query.set('receiptIds', unread.map((message) => message.id).join(','));
        let page: MessagePage;
        try {
          page = await request((signal) => deps.page(query, signal));
        } catch (error) {
          if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 'INVALID_MESSAGE_CURSOR'
          ) {
            newest = null;
            oldest = null;
            publish({ messages: [], ready: false, hasOlder: false });
          }
          throw error;
        }
        check();
        merge(page);
        if (!after) {
          oldest = page.oldestCursor;
          publish({ hasOlder: page.hasMore });
        }
        newest = page.newestCursor ?? newest;
        publish({ ready: true, error: null });
        await reconcilePending();
        if (!after || !page.hasMore) break;
      }
    })()
      .catch(report)
      .finally(() => {
        syncing = undefined;
      });
    return syncing;
  };
  const dispatch = async (message: PendingMessage) => {
    check();
    if (state.sending.includes(message.clientMessageId)) return;
    publish({ sending: [...state.sending, message.clientMessageId], error: null });
    try {
      // Also retry persistence after any ambiguous keychain error before dispatch.
      await persist();
      check();
      const result = await request((signal) => deps.send(message, signal));
      check();
      publish({ messages: mergeMessages(state.messages, [result]) });
      await reconcilePending();
    } catch (error) {
      report(error);
    } finally {
      publish({ sending: state.sending.filter((id) => id !== message.clientMessageId) });
    }
  };
  return {
    getSnapshot: () => state,
    subscribe(this: void, listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    sync,
    async loadOlder() {
      if (!oldest || !state.hasOlder || state.loadingOlder) return;
      publish({ loadingOlder: true });
      try {
        const query = new URLSearchParams({ before: oldest, limit: '50' });
        const page = await request((signal) => deps.page(query, signal));
        check();
        merge(page);
        oldest = page.oldestCursor ?? oldest;
        publish({ hasOlder: page.hasMore, error: null });
      } catch (error) {
        report(error);
      } finally {
        publish({ loadingOlder: false });
      }
    },
    async submit(content: string, contentType: PendingMessage['contentType'] = 'TEXT') {
      await hydrate();
      check();
      if (state.pending.length >= 8)
        throw new Error('Retry your waiting messages before sending more.');
      const message = pendingSchema.parse({
        clientMessageId: deps.makeId(),
        content,
        contentType,
        createdAt: new Date().toISOString(),
      });
      publish({ pending: [...state.pending, message] });
      // dispatch retains the pending row on failure, including storage failures.
      await dispatch(message);
    },
    async retry(id: string) {
      await hydrate();
      check();
      const message = state.pending.find((item) => item.clientMessageId === id);
      if (message) await dispatch(message);
    },
    dispose() {
      disposed = true;
      abort.abort();
      listeners.clear();
    },
  };
}
