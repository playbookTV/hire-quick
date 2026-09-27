import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createChatController,
  mergeMessages,
  type MessagePage,
  type PendingMessage,
} from '../../../../mobile/lib/chat.js';
import type { Message } from '../../../../mobile/lib/types.js';
import { messagePageInput } from '../validation.js';
import { checkoutStorage } from '../../../../mobile/lib/checkout-storage.js';

const userId = randomUUID();
const bookingId = randomUUID();
const message = (id: string = randomUUID(), content = 'Hello'): Message => ({
  id,
  conversationId: bookingId,
  senderId: userId,
  content,
  contentType: 'TEXT',
  flagged: false,
  createdAt: '2026-09-22T12:00:00.000Z',
  seenAt: null,
});
const page = (items: Message[] = [], hasMore = false): MessagePage => ({
  items,
  hasMore,
  oldestCursor: items[0]?.id ?? null,
  newestCursor: items.at(-1)?.id ?? null,
  receipts: [],
});
function setup() {
  const values = new Map<string, string>();
  const storage = {
    read: vi.fn(async (key: string) => values.get(key) ?? null),
    write: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    remove: vi.fn(async (key: string) => {
      values.delete(key);
    }),
  };
  const send = vi.fn(async (input: PendingMessage) =>
    message(input.clientMessageId, input.content),
  );
  const getPage = vi.fn(async (_query: URLSearchParams, _signal: AbortSignal) => page());
  const current = { value: true };
  const deps = {
    userId,
    bookingId,
    storage,
    send,
    page: getPage,
    makeId: randomUUID,
    isCurrent: () => current.value,
  };
  return { values, storage, send, getPage, current, deps, chat: createChatController(deps) };
}

describe('chat history and durable send controller', () => {
  it('times out a stalled send while retaining its ID for a safe retry', async () => {
    vi.useFakeTimers();
    try {
      const { chat, send } = setup();
      send.mockImplementationOnce(() => new Promise(() => undefined));
      const sending = chat.submit('Slow network');
      await vi.advanceTimersByTimeAsync(15_000);
      await sending;
      expect(chat.getSnapshot().error).toContain('timed out');
      expect(chat.getSnapshot().pending).toHaveLength(1);
      expect(chat.getSnapshot().sending).toEqual([]);
      await chat.retry(chat.getSnapshot().pending[0]!.clientMessageId);
      expect(send.mock.calls[1]?.[0].clientMessageId).toBe(send.mock.calls[0]?.[0].clientMessageId);
    } finally {
      vi.useRealTimers();
    }
  });
  it('stores long Unicode messages in isolated keychain chunks without splitting emoji', async () => {
    const saved = new Map<string, string>();
    const keychain = {
      getItemAsync: async (key: string) => saved.get(key) ?? null,
      setItemAsync: async (key: string, value: string) => {
        // Native encoding replaces lone surrogates: ensure that never changes data.
        expect(Buffer.from(value).toString()).toBe(value);
        expect(Buffer.byteLength(value)).toBeLessThan(2048);
        saved.set(key, value);
      },
      deleteItemAsync: async (key: string) => {
        saved.delete(key);
      },
    };
    const storage = checkoutStorage(keychain, randomUUID, 'hq.chat');
    const value = JSON.stringify([{ content: 'a'.repeat(486) + '🙂界'.repeat(1000) }]);
    await storage.write('user.booking', value);
    expect(await storage.read('user.booking')).toBe(value);
    expect(await checkoutStorage(keychain, randomUUID).read('user.booking')).toBeNull();
  });
  it('bounds query sizes and rejects ambiguous or forged cursor shapes', () => {
    expect(messagePageInput.parse({}).limit).toBe(50);
    for (const query of [
      { limit: 0 },
      { limit: 101 },
      { limit: 1.5 },
      { before: randomUUID(), after: randomUUID() },
      { after: 'not-a-uuid' },
      { receiptIds: Array.from({ length: 101 }, () => randomUUID()).join(',') },
    ]) {
      expect(messagePageInput.safeParse(query).success).toBe(false);
    }
  });
  it('deduplicates overlapping responses without rolling back read receipts', () => {
    const first = message();
    const read = { ...first, seenAt: '2026-09-22T12:01:00.000Z' };
    expect(mergeMessages([read], [first, first])).toEqual([read]);
    expect(mergeMessages([first], [], [{ id: first.id, seenAt: read.seenAt }])).toEqual([read]);
  });
  it('fetches only newer messages after the first page and preserves older history', async () => {
    const { chat, getPage } = setup();
    const first = message();
    const next = message();
    const older = message();
    getPage
      .mockResolvedValueOnce(page([first], true))
      .mockResolvedValueOnce(page([next]))
      .mockResolvedValueOnce(page([older]));
    await chat.sync();
    await chat.sync();
    await chat.loadOlder();
    expect(getPage.mock.calls[1]?.[0].get('after')).toBe(first.id);
    expect(getPage.mock.calls[2]?.[0].get('before')).toBe(first.id);
    expect(new Set(chat.getSnapshot().messages.map((m) => m.id))).toEqual(
      new Set([first.id, next.id, older.id]),
    );
    expect(chat.getSnapshot().hasOlder).toBe(false);
  });
  it('drains multiple bounded pages after a missed-update gap', async () => {
    const { chat, getPage } = setup();
    const first = message();
    const next = message();
    const last = message();
    getPage
      .mockResolvedValueOnce(page([first]))
      .mockResolvedValueOnce(page([next], true))
      .mockResolvedValueOnce(page([last]));
    await chat.sync();
    await chat.sync();
    expect(getPage.mock.calls[2]?.[0].get('after')).toBe(next.id);
    expect(chat.getSnapshot().messages).toHaveLength(3);
  });
  it('persists before dispatch and restores the identical ID after a lost response', async () => {
    const { chat, send, deps, values } = setup();
    send.mockImplementationOnce(async (input) => {
      expect(values.get(`${userId}.${bookingId}`)).toContain(input.clientMessageId);
      throw new Error('Response lost');
    });
    await chat.submit('Hello');
    const original = chat.getSnapshot().pending[0]!;
    chat.dispose();
    const restored = createChatController(deps);
    await restored.sync();
    expect(send).toHaveBeenCalledTimes(1); // Restore never auto-sends.
    await restored.retry(original.clientMessageId);
    expect(send.mock.calls[1]?.[0]).toEqual(original);
    expect(restored.getSnapshot().pending).toEqual([]);
  });
  it('joins rapid retry taps and blocks sending when durable storage fails', async () => {
    const { chat, send, storage } = setup();
    storage.write.mockRejectedValueOnce(new Error('Keychain unavailable'));
    await chat.submit('Hello');
    expect(send).not.toHaveBeenCalled();
    const id = chat.getSnapshot().pending[0]!.clientMessageId;
    await Promise.all([chat.retry(id), chat.retry(id)]);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('reconciles a lost acknowledgement from history without resending', async () => {
    const { chat, send, getPage } = setup();
    send.mockRejectedValueOnce(new Error('Response lost'));
    await chat.submit('Hello');
    const id = chat.getSnapshot().pending[0]!.clientMessageId;
    getPage.mockResolvedValueOnce(page([message(id)]));
    await chat.sync();
    expect(chat.getSnapshot().pending).toHaveLength(0);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('isolates saved content by user and booking, and fences stale sessions', async () => {
    const { chat, send, deps, current } = setup();
    send.mockRejectedValueOnce(new Error('Offline'));
    await chat.submit('Private');
    for (const scope of [{ userId: randomUUID() }, { bookingId: randomUUID() }]) {
      const other = createChatController({ ...deps, ...scope });
      await other.sync();
      expect(other.getSnapshot().pending).toEqual([]);
    }
    current.value = false;
    await expect(chat.retry(chat.getSnapshot().pending[0]!.clientMessageId)).rejects.toThrow(
      'session',
    );
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('does not let an in-flight fetch repopulate state after disposal', async () => {
    const { chat, getPage } = setup();
    let finish!: (value: MessagePage) => void;
    getPage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const syncing = chat.sync();
    await vi.waitFor(() => expect(getPage).toHaveBeenCalledTimes(1));
    chat.dispose();
    finish(page([message()]));
    await syncing;
    expect(chat.getSnapshot().messages).toEqual([]);
  });
});
