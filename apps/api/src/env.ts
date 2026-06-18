import 'dotenv/config';
import { z } from 'zod';

// Secrets come only from the environment (application-security). Fail fast if
// a required var is missing or malformed.
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),
  JWT_ACCESS_SECRET: z.string().min(1).default('dev-access-secret'),
  JWT_REFRESH_SECRET: z.string().min(1).default('dev-refresh-secret'),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2_592_000),
  PAYSTACK_SECRET_KEY: z.string().default(''),
  PAYSTACK_WEBHOOK_SECRET: z.string().default(''),
  // Paystack transfer recipient for HireQuick's own operating bank (commission sweep, D3).
  PAYSTACK_OPERATING_RECIPIENT: z.string().default(''),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);
