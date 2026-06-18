import { createApp } from './app.js';
import { env } from './env.js';
import { HttpPaystack } from './modules/payments/port/http-paystack.js';

const paystack = new HttpPaystack(env.PAYSTACK_SECRET_KEY);
const app = createApp({
  paystack,
  // Paystack signs webhooks with the secret key unless a separate one is set.
  paystackSecret: env.PAYSTACK_WEBHOOK_SECRET || env.PAYSTACK_SECRET_KEY,
});

app.listen(env.PORT, () => {
   
  console.log(`hirequick-api listening on :${env.PORT} (${env.NODE_ENV})`);
});
