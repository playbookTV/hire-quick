import './observability/init.js';
import { createServer } from 'node:http';
import { logger } from './logger.js';
import { reportError } from './observability/reporting.js';
import { Redis } from 'ioredis';
import { createApp } from './app.js';
import { env } from './env.js';
import { HttpPaystack } from './modules/payments/port/http-paystack.js';
import { createSocketGateway } from './realtime/gateway.js';
import { createStorageFromEnv } from './modules/storage/storage.js';
import { SmileKyc } from './modules/verification/port/smile-kyc.js';
import { NoopKyc } from './modules/verification/port/noop-kyc.js';

const paystack = new HttpPaystack(env.PAYSTACK_SECRET_KEY);

// Manual-only test deployments retain document review and refuse biometric sessions.
const kyc =
  env.KYC_MODE === 'smile' && env.SMILE_PARTNER_ID && env.SMILE_API_KEY && env.SMILE_CALLBACK_URL && env.SMILE_PRIVACY_POLICY_URL
    ? new SmileKyc({
        partnerId: env.SMILE_PARTNER_ID, apiKey: env.SMILE_API_KEY,
        environment: env.SMILE_ENVIRONMENT, callbackUrl: env.SMILE_CALLBACK_URL,
        privacyPolicyUrl: env.SMILE_PRIVACY_POLICY_URL,
      })
    : new NoopKyc();

// Dedicated Redis client for shared rate-limit counters (multi-replica safe).
const rateLimitRedis = new Redis(env.REDIS_URL);
rateLimitRedis.on('error', (error) => {
  logger.error({ err: error, code: 'REDIS_CONNECTION_ERROR' }, 'rate limit Redis error');
  reportError(error, { code: 'REDIS_CONNECTION_ERROR' });
});

// One gateway, shared between the HTTP app (lifecycle pushes) and the Socket.IO
// server (chat + delivery). Redis adapter fans pushes out across Railway replicas.
const realtime = createSocketGateway({ redisUrl: env.REDIS_URL });

const app = createApp({
  paystack,
  paystackSecret: env.PAYSTACK_WEBHOOK_SECRET || env.PAYSTACK_SECRET_KEY,
  realtime,
  corsOrigins: env.CORS_ORIGINS,
  rateLimitRedis,
  trustProxy: env.TRUST_PROXY,
  storage: createStorageFromEnv(env),
  kyc,
});

const server = createServer(app);
realtime.attach(server); // Socket.IO: booking chat + realtime lifecycle pushes

server.listen(env.PORT, () => {

  logger.info({ port: env.PORT, monitoringEnabled: Boolean(env.SENTRY_DSN) }, 'API listening');
});
