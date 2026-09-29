import { randomUUID } from 'node:crypto';
import * as Sentry from '@sentry/node';
import type { Request, RequestHandler } from 'express';
import type { Logger } from 'pino';

/** Log only route templates, never raw URLs, headers, bodies, IPs or auth data. */
export function requestLogging(log: Logger): RequestHandler {
  return (req, res, next) =>
    Sentry.withIsolationScope(() =>
      Sentry.startSpanManual(
        {
          name: 'HTTP request',
          op: 'http.server',
          parentSpan: null,
          attributes: { 'hq.kind': 'http', 'http.request.method': req.method },
        },
        (span) => {
          const suppliedId = req.header('x-request-id');
          const reqId =
            suppliedId &&
            /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(suppliedId)
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
              method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(
                req.method,
              )
                ? req.method
                : 'OTHER',
              route: typeof route === 'string' ? route : 'unmatched',
              statusCode: res.statusCode,
              durationMs: Math.round((performance.now() - started) * 100) / 100,
              aborted: !res.writableFinished,
            };
            span.setAttributes({
              'hq.route': fields.route,
              'http.response.status_code': fields.statusCode,
              'hq.aborted': fields.aborted,
            });
            Sentry.updateSpanName(span, `${fields.method} ${fields.route}`);
            Sentry.setHttpStatus(span, res.statusCode);
            // Streamed spans classify 'cancelled' as non-error; retain the failure
            // status explicitly and distinguish aborts with hq.aborted.
            if (fields.aborted) span.setStatus({ code: 2, message: 'internal_error' });
            span.end();
            if (fields.aborted || res.statusCode >= 500) log.error(fields, 'http request');
            else if (res.statusCode >= 400) log.warn(fields, 'http request');
            else log.info(fields, 'http request');
          };
          res.once('finish', record);
          res.once('close', record);
          next();
        },
      ),
    );
}
