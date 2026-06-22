import { createServer } from 'node:http';
import { Redis } from 'ioredis';
import { createApp } from './app.js';
import { env } from './env.js';
import { HttpPaystack } from './modules/payments/port/http-paystack.js';
import { createSocketGateway } from './realtime/gateway.js';
import { createStorageFromEnv } from './modules/storage/storage.js';

const paystack = new HttpPaystack(env.PAYSTACK_SECRET_KEY);

// Dedicated Redis client for shared rate-limit counters (multi-replica safe).
const rateLimitRedis = new Redis(env.REDIS_URL);

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
});

const server = createServer(app);
realtime.attach(server); // Socket.IO: booking chat + realtime lifecycle pushes

server.listen(env.PORT, () => {

  console.log(`hirequick-api listening on :${env.PORT} (${env.NODE_ENV})`);
});
