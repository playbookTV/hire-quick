import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { prisma } from '@hq/database';
import { paystackWebhookRouter } from './modules/payments/webhooks/paystack-webhook.js';
import { paymentsRouter } from './modules/payments/http/routes.js';
import type { PaystackPort } from './modules/payments/port/paystack-port.js';
import { authRouter } from './modules/auth/routes.js';
import { profileRouter } from './modules/profile/routes.js';
import { adminRouter } from './modules/admin/routes.js';
import { eventsRouter } from './modules/events/routes.js';
import { bookingsRouter } from './modules/bookings/routes.js';

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
}

export function createApp(config: AppConfig = {}): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  // Reflect the request origin so the admin SPA can call the API. Tighten to an
  // allowlist at the production cutover (Phase 9).
  app.use(cors({ origin: true }));

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
      paystackWebhookRouter({ prisma, secret: config.paystackSecret }),
    );
  }

  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'hirequick-api' });
  });

  app.use('/auth', authRouter());
  app.use('/api/me', profileRouter());
  app.use('/api/admin', adminRouter());
  app.use('/api', bookingsRouter());

  if (config.paystack) {
    app.use('/api/payments', paymentsRouter({ prisma, paystack: config.paystack }));
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
