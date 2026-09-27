import { logger } from '../logger.js';

/** Monitoring delivery cannot make a successful money job fail or retry. */
export async function heartbeat(url: string, ok: boolean): Promise<void> {
  if (!url) return;
  try {
    const result = await fetch(`${url}${ok ? '' : '/fail'}`, {
      method: 'POST',
      signal: AbortSignal.timeout(2000),
      redirect: 'error',
    });
    if (!result.ok) throw new Error('Heartbeat rejected');
  } catch {
    // URL contains the monitor's secret; never include it or the fetch error.
    logger.warn({ code: 'HEARTBEAT_DELIVERY_FAILED' }, 'monitoring delivery failed');
  }
}
