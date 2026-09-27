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
  PROCESS_TYPE: z.enum(['api', 'worker']).default('api'),
  SENTRY_DSN: z.union([z.literal(''), z.string().url()]).default(''),
  SENTRY_RELEASE: z.string().max(200).default(''),
  // Server-only read access for the admin observability page; never a VITE_/EXPO_PUBLIC_ value.
  BETTER_STACK_API_TOKEN: z.string().default(''),
  BETTER_STACK_API_MONITOR_ID: z.string().regex(/^\d*$/).default(''),
  BETTER_STACK_CHECKOUTS_MONITOR_ID: z.string().regex(/^\d*$/).default(''),
  BETTER_STACK_RECONCILIATION_MONITOR_ID: z.string().regex(/^\d*$/).default(''),
  BETTER_STACK_AUDIT_MONITOR_ID: z.string().regex(/^\d*$/).default(''),
  SENTRY_READ_TOKEN: z.string().default(''),
  SENTRY_ORGANIZATION: z.string().regex(/^[a-z0-9_-]+$/).default('studio-templar'),
  SENTRY_READ_PROJECTS: z.string().regex(/^[a-zA-Z0-9_-]+(?:,[a-zA-Z0-9_-]+)*$/).default('react-native'),
  SENTRY_API_ORIGIN: z.enum(['https://sentry.io', 'https://de.sentry.io', 'https://us.sentry.io']).default('https://de.sentry.io'),
  // Secret monitor URLs: restrict to the Better Stack heartbeat API.
  BETTER_STACK_CHECKOUTS_HEARTBEAT_URL: z.union([z.literal(''), z.string().regex(/^https:\/\/uptime\.betterstack\.com\/api\/v1\/heartbeat\/[a-zA-Z0-9_-]+$/)]).default(''),
  BETTER_STACK_RECONCILIATION_HEARTBEAT_URL: z.union([z.literal(''), z.string().regex(/^https:\/\/uptime\.betterstack\.com\/api\/v1\/heartbeat\/[a-zA-Z0-9_-]+$/)]).default(''),
  BETTER_STACK_AUDIT_HEARTBEAT_URL: z.union([z.literal(''), z.string().regex(/^https:\/\/uptime\.betterstack\.com\/api\/v1\/heartbeat\/[a-zA-Z0-9_-]+$/)]).default(''),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),
  JWT_ACCESS_SECRET: z.string().min(1).default('dev-access-secret'),
  JWT_REFRESH_SECRET: z.string().min(1).default('dev-refresh-secret'),
  OTP_VERIFIER_SECRET: z.string().default(''),
  // Explicit, server-only access for the four seeded staging QA identities.
  STAGING_QA_OTP_CODE: z.union([z.literal(''), z.string().regex(/^[0-9]{6}$/)]).default(''),
  OTP_VERIFIER_KEY_ID: z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/).default('v1'),
  OTP_VERIFIER_PREVIOUS_SECRET: z.string().default(''),
  OTP_VERIFIER_PREVIOUS_KEY_ID: z.string().regex(/^[a-zA-Z0-9_-]{0,32}$/).default(''),
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
  // KYC: raw ID document + selfie deleted this many days after verification
  // VERIFIED / REJECTED (only the pass/fail flag + reviewer/audit record persist).
  RETENTION_KYC_VERIFIED_DAYS: z.coerce.number().int().positive().default(90),
  RETENTION_KYC_REJECTED_DAYS: z.coerce.number().int().positive().default(30),
  // Chat messages (+ their media) deleted this many days after the booking's
  // dispute window closes.
  RETENTION_CHAT_DAYS: z.coerce.number().int().positive().default(180),
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
  // Brevo — transactional SMS + email (notifications). Empty = unavailable outside isolated tests.
  BREVO_API_KEY: z.string().default(''),
  BREVO_EMAIL_SENDER: z.string().email().default('no-reply@hirequick.app'),
  BREVO_SMS_SENDER: z.string().default('HireQuick'),
  // A configured KudiSMS key selects Nigerian SMS OTP ahead of legacy routes.
  KUDISMS_API_KEY: z.union([z.literal(''), z.string().trim().min(1)]).default(''),
  KUDISMS_SENDER_ID: z.string().trim().regex(/^[A-Za-z0-9 ]{1,11}$/).default('HIREQUICK'),
  // Twilio Programmable Messaging: WhatsApp delivery of our locally verified OTP.
  // Leave all five empty for SMS only; partial configuration fails boot.
  TWILIO_ACCOUNT_SID: z.union([z.literal(''), z.string().regex(/^AC[0-9a-fA-F]{32}$/)]).default(''),
  TWILIO_API_KEY_SID: z.union([z.literal(''), z.string().regex(/^SK[0-9a-fA-F]{32}$/)]).default(''),
  TWILIO_API_KEY_SECRET: z.string().default(''),
  TWILIO_WHATSAPP_FROM: z.union([z.literal(''), z.string().regex(/^whatsapp:\+[1-9]\d{7,14}$/)]).default(''),
  TWILIO_WHATSAPP_CONTENT_SID: z.union([z.literal(''), z.string().regex(/^HX[0-9a-fA-F]{32}$/)]).default(''),
  // Smile ID v3 credentials stay on the server; mobile receives short-lived tokens.
  KYC_MODE: z.enum(['smile', 'manual']).default('smile'),
  SMILE_PARTNER_ID: z.string().default(''),
  SMILE_API_KEY: z.string().default(''),
  SMILE_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  SMILE_CALLBACK_URL: z.string().default(''),
  SMILE_PRIVACY_POLICY_URL: z.string().default(''),
  // Firebase Cloud Messaging (push). All three from the service-account JSON.
  // When all are set, recordPush sends real pushes; otherwise it stubs to a log.
  FCM_PROJECT_ID: z.string().default(''),
  FCM_CLIENT_EMAIL: z.string().default(''),
  FCM_PRIVATE_KEY: z.string().default(''),
  // §23 Q3: when 'true', a payout additionally requires a BVN-verified bank
  // account. Off until the live Paystack BVN match is wired; the account-name
  // verification gate applies regardless.
  WITHDRAWAL_REQUIRE_BVN: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
}).superRefine((cfg, ctx) => {
  const twilioKeys = ['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET',
    'TWILIO_WHATSAPP_FROM', 'TWILIO_WHATSAPP_CONTENT_SID'] as const;
  if (twilioKeys.some((key) => cfg[key])) {
    for (const key of twilioKeys) {
      if (!cfg[key].trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key],
        message: 'All Twilio WhatsApp settings must be configured together' });
    }
  }
  if (cfg.STAGING_QA_OTP_CODE &&
      (cfg.NODE_ENV !== 'staging' || !cfg.PAYSTACK_SECRET_KEY.startsWith('sk_test_'))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['STAGING_QA_OTP_CODE'], message: 'QA login requires staging and Paystack test keys' });
  }
  if (!!cfg.OTP_VERIFIER_PREVIOUS_SECRET !== !!cfg.OTP_VERIFIER_PREVIOUS_KEY_ID) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['OTP_VERIFIER_PREVIOUS_SECRET'], message: 'previous OTP key ID and secret must be configured together' });
  }
  if (cfg.OTP_VERIFIER_PREVIOUS_KEY_ID === cfg.OTP_VERIFIER_KEY_ID) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['OTP_VERIFIER_PREVIOUS_KEY_ID'], message: 'current and previous OTP key IDs must differ' });
  }
  for (const name of ['OTP_VERIFIER_SECRET', 'OTP_VERIFIER_PREVIOUS_SECRET'] as const) {
    if (cfg[name] && (cfg[name].length < 32 || cfg[name].startsWith('dev-'))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [name], message: 'OTP secret must contain at least 32 characters and must not be a development default' });
    }
  }
  // Fail fast: the JWT secrets carry dev-friendly defaults so tests/dev boot with
  // zero config, but in production or staging a forgotten env var would mean
  // signing tokens with a publicly-known secret — anyone could forge an ADMIN
  // token. Require both to be explicitly set to a strong value for any deployed
  // environment. Only 'development' and 'test' are exempt.
  if (cfg.NODE_ENV === 'development' || cfg.NODE_ENV === 'test') return;
  const weak = (s: string): boolean => s.length < 32 || s.startsWith('dev-');
  for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'OTP_VERIFIER_SECRET'] as const) {
    if (weak(cfg[name])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [name],
        message: `${name} must be set to a strong (>= 32 char, non-default) value in production`,
      });
    }
  }
  // Production cannot run on dev stubs: payments, OTP delivery, and KYC document
  // storage must all be wired, or the app silently degrades (e.g. verification
  // accepting arbitrary URLs, OTPs only logged). Fail fast at boot instead.
  const require = (name: keyof typeof cfg, label: string): void => {
    if (!cfg[name]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [name], message: `${label} is required in production` });
    }
  };
  require('PAYSTACK_SECRET_KEY', 'Paystack secret key');
  require('PAYSTACK_WEBHOOK_SECRET', 'Paystack webhook secret');
  require('BREVO_API_KEY', 'Brevo API key (OTP/notification delivery)');
  require('STORAGE_BUCKET', 'KYC document storage bucket');
  require('STORAGE_ACCESS_KEY', 'KYC document storage access key');
  require('STORAGE_SECRET_KEY', 'KYC document storage secret key');
  if (cfg.KYC_MODE === 'manual' && cfg.NODE_ENV === 'production') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['KYC_MODE'], message: 'manual-only testing mode is unavailable in production' });
  }
  if (cfg.KYC_MODE === 'smile') {
    require('SMILE_PARTNER_ID', 'Smile ID partner ID');
    require('SMILE_API_KEY', 'Smile ID API key');
    for (const key of ['SMILE_CALLBACK_URL', 'SMILE_PRIVACY_POLICY_URL'] as const) {
      if (!z.string().url().startsWith('https://').safeParse(cfg[key]).success)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'A public HTTPS URL is required' });
    }
    if (!/^[1-9]\d*$/.test(cfg.SMILE_PARTNER_ID))
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['SMILE_PARTNER_ID'], message: 'Numeric Smile partner ID required' });
    if (cfg.NODE_ENV === 'production' && cfg.SMILE_ENVIRONMENT !== 'production')
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['SMILE_ENVIRONMENT'], message: 'Production must use live identity verification' });
  }
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);
