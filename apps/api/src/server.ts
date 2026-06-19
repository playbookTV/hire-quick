import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './env.js';
import { HttpPaystack } from './modules/payments/port/http-paystack.js';
import { attachRealtime } from './realtime/socket.js';

const paystack = new HttpPaystack(env.PAYSTACK_SECRET_KEY);
const app = createApp({
  paystack,
  paystackSecret: env.PAYSTACK_WEBHOOK_SECRET || env.PAYSTACK_SECRET_KEY,
});

const server = createServer(app);
attachRealtime(server); // Socket.IO booking chat

server.listen(env.PORT, () => {
   
  console.log(`hirequick-api listening on :${env.PORT} (${env.NODE_ENV})`);
});
