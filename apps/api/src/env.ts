import 'dotenv/config';
import { z } from 'zod';

// Secrets come only from the environment (application-security). Fail fast if
// a required var is missing or malformed.
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  // Number of reverse-proxy hops in front of the app (Railway edge = 1). Lets
  // express-rate-limit read the real client IP from X-Forwarded-For. 0 = trust
  // none (dev/test, no proxy).
  TRUST_PROXY: z.coerce.number().int().nonnegative().default(0),
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
  // NDPR retention windows (TRD §14) for the daily purge job. Financial/ledger
  // rows are never purged by this — only transient PII.
  RETENTION_OTP_DAYS: z.coerce.number().int().positive().default(30),
  RETENTION_DEVICE_TOKEN_DAYS: z.coerce.number().int().positive().default(180),
  // S3-compatible object storage for KYC documents (Backblaze B2 / Cloudflare R2
  // / AWS S3). Empty bucket/creds = storage disabled (dev/test fall back to the
  // legacy URL-passthrough behavior). STORAGE_ENDPOINT empty = AWS S3 default.
  STORAGE_ENDPOINT: z.string().default(''),
  STORAGE_REGION: z.string().default('us-east-1'),
  STORAGE_BUCKET: z.string().default(''),
  STORAGE_ACCESS_KEY: z.string().default(''),
  STORAGE_SECRET_KEY: z.string().default(''),
  // Comma-separated browser-origin allowlist for CORS. Empty reflects any origin
  // (dev/test only) — production MUST set this to the admin SPA + mobile origins.
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  // Brevo — transactional SMS + email (notifications). Empty = dev stub.
  BREVO_API_KEY: z.string().default(''),
  BREVO_SMS_SENDER: z.string().default('HireQuick'),
  // Brevo WhatsApp — preferred OTP channel. Requires a connected WhatsApp
  // Business Account + an approved authentication template. When sender +
  // template are set, OTP goes over WhatsApp instead of SMS; otherwise it falls
  // back to SMS / dev stub. BREVO_WHATSAPP_OTP_PARAM is the template's variable
  // name the code is injected into (must match the approved template).
  BREVO_WHATSAPP_SENDER: z.string().default(''),
  BREVO_WHATSAPP_OTP_TEMPLATE_ID: z.coerce.number().int().nonnegative().default(0),
  BREVO_WHATSAPP_OTP_PARAM: z.string().default('code'),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);
