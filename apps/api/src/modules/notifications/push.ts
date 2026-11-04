/**
 * Expo push transport (Expo's push service relays to FCM and APNs). Sends are
 * fire-and-forget: a push failure must never block the action that triggered
 * it. Isolated tests record intent only and never reach the network. Logs carry
 * fixed labels, HTTP statuses and Expo error codes, never tokens or message text.
 */
import { prisma } from '@hq/database';
import { z } from 'zod';
import type { PushCategory, PushChannel, PushData } from '@hq/shared';
import { env } from '../../env.js';
import { logger } from '../../logger.js';
import { reportError } from '../../observability/reporting.js';
import { record } from './test-recorder.js';

const IS_TEST = env.NODE_ENV === 'test';
const SEND_URL = 'https://exp.host/--/api/v2/push/send';
const RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const SEND_BATCH = 100; // Expo's per-request message limit
const RECEIPT_BATCH = 1000; // Expo's per-request receipt id limit
const RETRY_DELAYS_MS = [1_000, 4_000];
// Expo publishes receipts ~15 minutes after a send and clears them after 24 hours.
const RECEIPT_DELAY_MS = 15 * 60_000;
const RECEIPT_TTL_MS = 24 * 60 * 60_000;
const EXPO_ERRORS = new Set([
  'DeviceNotRegistered',
  'MessageTooBig',
  'MessageRateExceeded',
  'MismatchSenderId',
  'InvalidCredentials',
]);
// Credential problems stop every push; report them instead of only logging.
const CONFIG_ERRORS = new Set(['MismatchSenderId', 'InvalidCredentials']);

export interface PushMessage {
  /** Notification kind, e.g. a `NotificationType` or `MILESTONE_UNLOCKED`. */
  type: string;
  title: string;
  /** Lock-screen text: never venues, client-written text or identity details. */
  body: string;
  channel: PushChannel;
  target?: { targetType: string; targetId: string };
  categoryId?: PushCategory;
  /** Replaces an earlier notification with the same id, e.g. one per conversation. */
  collapseId?: string;
  /** iOS time-sensitive interruption level (needs the Time Sensitive capability). */
  timeSensitive?: boolean;
}

export interface PushDevice {
  id: string;
  token: string;
}

export type ExpoPost = (url: string, body: unknown) => Promise<unknown>;

const detailsSchema = z.object({ error: z.string().optional() }).passthrough().optional();
const ticketSchema = z.union([
  z.object({ status: z.literal('ok'), id: z.string().min(1).max(200) }).passthrough(),
  z.object({ status: z.literal('error'), details: detailsSchema }).passthrough(),
]);
const sendResponseSchema = z.object({ data: z.array(ticketSchema) });
const receiptsResponseSchema = z.object({
  data: z.record(z.string(), z.object({ status: z.enum(['ok', 'error']), details: detailsSchema }).passthrough()),
});

function log(message: string): void {
  logger.warn(`[push] ${message}`);
}

function errorCode(value: string | undefined): string {
  return value && EXPO_ERRORS.has(value) ? value : 'unknown';
}

function noteProviderError(code: string, stage: 'ticket' | 'receipt'): void {
  log(`${stage} error: ${code}`);
  if (CONFIG_ERRORS.has(code))
    reportError(new Error(`Expo push ${stage} rejected: ${code}`), { code: 'PUSH_CREDENTIALS' });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** POST to Expo with bounded retries on network errors, 429 and 5xx. Returns null on failure. */
export const expoPost: ExpoPost = async (url, body) => {
  if (IS_TEST) return null;
  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'accept-encoding': 'gzip, deflate',
          'content-type': 'application/json',
          ...(env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      // Fetch errors can embed headers or bodies; never pass them on.
      res = null;
    }
    if (res?.ok) {
      try {
        return await res.json();
      } catch {
        log('unreadable provider response');
        return null;
      }
    }
    const retryable = !res || res.status === 429 || res.status >= 500;
    const delay = RETRY_DELAYS_MS[attempt];
    if (!retryable || delay === undefined) {
      log(res ? `request failed: ${String(res.status)}` : 'transport request failed');
      return null;
    }
    await sleep(delay * (0.5 + Math.random()));
  }
};

function expoMessage(token: string, message: PushMessage, dispatchId: string) {
  const data: PushData = { type: message.type, dispatchId, ...message.target };
  return {
    to: token,
    title: message.title,
    body: message.body,
    data,
    sound: 'default',
    channelId: message.channel,
    // Job alerts can wait for the next radio wake-up; everything else is prompt.
    priority: message.channel === 'job_alerts' ? 'default' : 'high',
    ...(message.categoryId ? { categoryId: message.categoryId } : {}),
    ...(message.collapseId ? { collapseId: message.collapseId } : {}),
    ...(message.timeSensitive ? { interruptionLevel: 'time-sensitive' } : {}),
  };
}

/** Keep ok tickets for the receipts job; drop devices Expo already reports as gone. */
async function settleTickets(batch: readonly PushDevice[], response: unknown): Promise<void> {
  const parsed = sendResponseSchema.safeParse(response);
  if (!parsed.success) {
    log('unexpected send response');
    return;
  }
  const tickets: { id: string; deviceTokenId: string }[] = [];
  const gone: string[] = [];
  parsed.data.data.forEach((ticket, index) => {
    const device = batch[index];
    if (!device) return;
    if (ticket.status === 'ok') tickets.push({ id: ticket.id, deviceTokenId: device.id });
    else {
      const code = errorCode(ticket.details?.error);
      if (code === 'DeviceNotRegistered') gone.push(device.id);
      else noteProviderError(code, 'ticket');
    }
  });
  // A device removed meanwhile (logout, withdrawal) fails the FK; skip those tickets.
  if (tickets.length) {
    const live = await prisma.deviceToken.findMany({
      where: { id: { in: tickets.map((t) => t.deviceTokenId) } },
      select: { id: true },
    });
    const ids = new Set(live.map((d) => d.id));
    await prisma.pushTicket.createMany({
      data: tickets.filter((t) => ids.has(t.deviceTokenId)),
      skipDuplicates: true,
    });
  }
  if (gone.length) await prisma.deviceToken.deleteMany({ where: { id: { in: gone } } });
}

async function deliver(
  devices: readonly PushDevice[],
  message: PushMessage,
  dispatchId: string,
  post: ExpoPost,
): Promise<void> {
  for (let i = 0; i < devices.length; i += SEND_BATCH) {
    const batch = devices.slice(i, i + SEND_BATCH);
    const response = await post(
      SEND_URL,
      batch.map((device) => expoMessage(device.token, message, dispatchId)),
    );
    if (response === null) continue;
    try {
      await settleTickets(batch, response);
    } catch {
      log('ticket bookkeeping failed');
    }
  }
}

/**
 * Schedule one push to each device. Callers have already checked consent and
 * preferences under the user lock; this only dispatches, it does not await.
 */
export function sendPush(
  devices: readonly PushDevice[],
  message: PushMessage,
  dispatchId: string,
  post: ExpoPost = expoPost,
): void {
  for (const device of devices) record({ kind: 'push', to: device.token, summary: message.body });
  if (IS_TEST && post === expoPost) return;
  void deliver(devices, message, dispatchId, post).catch(() => log('push delivery failed'));
}

/** Test seam: await a send that `sendPush` would otherwise fire and forget. */
export function deliverForTest(
  devices: readonly PushDevice[],
  message: PushMessage,
  dispatchId: string,
  post: ExpoPost,
): Promise<void> {
  return deliver(devices, message, dispatchId, post);
}

/**
 * Read delivery receipts for tickets older than 15 minutes, delete devices Expo
 * reports as no longer registered, and drop tickets past Expo's 24-hour window.
 */
export async function checkPushReceipts(
  options: { now?: Date; post?: ExpoPost } = {},
): Promise<{ checked: number; pruned: number; expired: number }> {
  const now = (options.now ?? new Date()).getTime();
  const post = options.post ?? expoPost;
  const expired = await prisma.pushTicket.deleteMany({
    where: { createdAt: { lt: new Date(now - RECEIPT_TTL_MS) } },
  });
  const tickets = await prisma.pushTicket.findMany({
    where: { createdAt: { lt: new Date(now - RECEIPT_DELAY_MS) } },
    orderBy: { createdAt: 'asc' },
    take: 5 * RECEIPT_BATCH,
    select: { id: true, deviceTokenId: true },
  });
  let checked = 0;
  let pruned = 0;
  for (let i = 0; i < tickets.length; i += RECEIPT_BATCH) {
    const batch = tickets.slice(i, i + RECEIPT_BATCH);
    const response = await post(RECEIPTS_URL, { ids: batch.map((t) => t.id) });
    if (response === null) break;
    const parsed = receiptsResponseSchema.safeParse(response);
    if (!parsed.success) {
      log('unexpected receipts response');
      break;
    }
    const settled: string[] = [];
    const gone = new Set<string>();
    for (const ticket of batch) {
      const receipt = parsed.data.data[ticket.id];
      if (!receipt) continue; // not published yet; retried next run until it expires
      settled.push(ticket.id);
      if (receipt.status === 'ok') continue;
      const code = errorCode(receipt.details?.error);
      if (code === 'DeviceNotRegistered') gone.add(ticket.deviceTokenId);
      else noteProviderError(code, 'receipt');
    }
    checked += settled.length;
    await prisma.pushTicket.deleteMany({ where: { id: { in: settled } } });
    if (gone.size)
      pruned += (await prisma.deviceToken.deleteMany({ where: { id: { in: [...gone] } } })).count;
  }
  if (checked || pruned || expired.count)
    logger.info(
      `push receipts: ${String(checked)} checked, ${String(pruned)} device(s) pruned, ${String(expired.count)} expired`,
    );
  return { checked, pruned, expired: expired.count };
}
