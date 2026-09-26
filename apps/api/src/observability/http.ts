import { randomUUID } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import type { Logger } from 'pino';

/** Log only route templates, never raw URLs, headers, bodies, IPs or auth data. */
export function requestLogging(log: Logger): RequestHandler {
  return (req, res, next) => {
    const suppliedId = req.header('x-request-id');
    const reqId =
      suppliedId && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(suppliedId)
        ? suppliedId
        : randomUUID();
    (req as Request & { id: string }).id = reqId;
    res.setHeader('x-request-id', reqId);
    const started = performance.now();
    let recorded = false;
    const record = (): void => {
      if (recorded) return;
      recorded = true;
      const route = (req.route as { path?: unknown } | undefined)?.path;
      const fields = {
        reqId,
        method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(req.method)
          ? req.method
          : 'OTHER',
        route: typeof route === 'string' ? route : 'unmatched',
        statusCode: res.statusCode,
        durationMs: Math.round((performance.now() - started) * 100) / 100,
        aborted: !res.writableFinished,
      };
      if (fields.aborted || res.statusCode >= 500) log.error(fields, 'http request');
      else if (res.statusCode >= 400) log.warn(fields, 'http request');
      else log.info(fields, 'http request');
    };
    res.once('finish', record);
    res.once('close', record);
    next();
  };
}
