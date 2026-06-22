import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cors, { type CorsOptions } from 'cors';
import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { createRateLimiters } from './middleware/rate-limit.js';
import type { StoragePort } from './modules/storage/storage.js';
import { ZodError } from 'zod';
import { prisma } from '@hq/database';
import { paystackWebhookRouter } from './modules/payments/webhooks/paystack-webhook.js';
import { paymentsRouter } from './modules/payments/http/routes.js';
import type { PaystackPort } from './modules/payments/port/paystack-port.js';
import { authRouter } from './modules/auth/routes.js';
import { profileRouter } from './modules/profile/routes.js';
import { privacyRouter } from './modules/privacy/routes.js';
import { adminRouter } from './modules/admin/routes.js';
import { eventsRouter } from './modules/events/routes.js';
import { bookingsRouter } from './modules/bookings/routes.js';
import { ushersRouter } from './modules/ushers/routes.js';
import { noopGateway, type RealtimeGateway } from './realtime/gateway.js';

/** A leak-free error envelope: clients get a code + safe message, never internals. */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface AppConfig {
  paystack?: PaystackPort;
  paystackSecret?: string;
  realtime?: RealtimeGateway;
  /** Allowed browser origins. When empty/undefined, reflect any origin (dev/test only). */
  corsOrigins?: string[];
  /** Redis client for shared rate-limit counters. When absent, limiters are pass-through. */
  rateLimitRedis?: Redis;
  /** Reverse-proxy hops to trust so req.ip is the real client IP (rate-limit keying). 0 = none. */
  trustProxy?: number;
  /** S3-compatible storage for KYC documents. When absent, legacy URL passthrough. */
  storage?: StoragePort | undefined;
}

/** Allowlist in production; reflect-all only when no list is configured (dev/test). */
function corsOriginFor(allowlist: string[] | undefined): CorsOptions['origin'] {
  if (!allowlist || allowlist.length === 0) return true;
  return (origin, cb) => {
    // Allow same-origin / non-browser callers (no Origin header) and allowlisted origins.
    if (!origin || allowlist.includes(origin)) {
      cb(null, true);
      return;
    }
    cb(new Error('Not allowed by CORS'));
  };
}

export function createApp(config: AppConfig = {}): Express {
  const app = express();
  // Trust N proxy hops so req.ip is the real client IP (rate-limit keying).
  // 0 leaves trust proxy disabled (express treats 0 as "trust none").
  app.set('trust proxy', config.trustProxy ?? 0);
  const realtime = config.realtime ?? noopGateway;
  const limiters = createRateLimiters(config.rateLimitRedis);

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: corsOriginFor(config.corsOrigins) }));
  app.use(limiters.global);

  app.use((req: Request, res: Response, next: NextFunction) => {
    const id = req.header('x-request-id') ?? randomUUID();
    res.setHeader('x-request-id', id);
    (req as Request & { id: string }).id = id;
    next();
  });

  // Webhook needs the RAW body for signature verification — mount BEFORE json.
  if (config.paystack && config.paystackSecret) {
    app.use(
      '/webhooks/paystack',
      express.raw({ type: '*/*' }),
      paystackWebhookRouter({ prisma, secret: config.paystackSecret, realtime }),
    );
  }

  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'hirequick-api' });
  });

  app.use('/auth', limiters.auth, authRouter());
  app.use('/api/me', profileRouter(config.storage));
  app.use('/api/me', privacyRouter());
  app.use('/api/admin', adminRouter({ realtime, storage: config.storage }));
  app.use('/api', bookingsRouter({ realtime }));
  app.use('/api', ushersRouter(config.storage));

  if (config.paystack) {
    app.use('/api/payments', limiters.money, paymentsRouter({ prisma, paystack: config.paystack, realtime }));
    app.use('/api', eventsRouter({ prisma, paystack: config.paystack }));
  }

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid request', issues: err.issues } });
      return;
    }
    if (err instanceof ApiError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
  });

  return app;
}
