import type { RequestHandler } from 'express';

/** Bounded responses and single-flight probes prevent a monitor flooding a down DB. */
export function readinessHandler(
  probes: { database: () => Promise<unknown>; redis: () => Promise<unknown> },
  timeoutMs = 2000,
): RequestHandler {
  let flight: Promise<boolean> | undefined;
  let cached: { ok: boolean; until: number } | undefined;
  const check = async (): Promise<boolean> => {
    if (cached && Date.now() < cached.until) return cached.ok;
    flight ??= Promise.allSettled([
      Promise.resolve().then(probes.database),
      Promise.resolve().then(probes.redis),
    ]).then((results) => {
      const ok = results.every((result) => result.status === 'fulfilled');
      cached = { ok, until: Date.now() + 5000 };
      flight = undefined;
      return ok;
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        flight,
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  return (_req, res) => {
    res.setHeader('cache-control', 'no-store');
    void check().then((ok) =>
      res.status(ok ? 200 : 503).json({ status: ok ? 'ready' : 'unavailable' }),
    );
  };
}
