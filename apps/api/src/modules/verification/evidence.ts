/** Transient provider evidence. Never write raw IDs, photos or callback payloads to Postgres. */
import { z } from 'zod';
import type { Redis } from 'ioredis';
import type { KycResult, KycWebhook } from './port/kyc-port.js';

const text = z.string().trim().max(250).nullish();
const media = z.string().max(8192).nullish();
const callbackEvidence = z.object({
  status: z.enum(['clear', 'attention', 'block', 'error']),
  image_links: z.object({ selfie_image: media }).nullish(),
  id_fields: z
    .object({
      full_name: text,
      first_name: text,
      other_names: text,
      last_name: text,
      id_number: text,
      photo_url: media,
      document_link: media,
    })
    .nullish(),
  user_provided_info: z.object({ given_names: text, last_name: text }).nullish(),
});
function safeMedia(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    // Provider's documented signed-media bucket. Never accept arbitrary callback URLs.
    return url.protocol === 'https:' &&
      url.hostname === 'smile-results.s3.eu-west-1.amazonaws.com' &&
      !url.username &&
      !url.password &&
      !url.port
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function mediaExpiry(value: string | null): number {
  if (!value) return Infinity;
  const query = new URL(value).searchParams;
  const issued = query.get('X-Amz-Date');
  const lifetime = Number(query.get('X-Amz-Expires'));
  if (!issued || !/^\d{8}T\d{6}Z$/.test(issued) || !lifetime) return Infinity;
  const date = `${issued.slice(0, 4)}-${issued.slice(4, 6)}-${issued.slice(6, 8)}T${issued.slice(9, 11)}:${issued.slice(11, 13)}:${issued.slice(13, 15)}Z`;
  const expires = Date.parse(date) + lifetime * 1000 - 30_000;
  return Number.isFinite(expires) ? expires : 0;
}
export interface ReviewEvidence {
  status: string;
  fullName: string | null;
  submittedName: string | null;
  maskedId: string | null;
  selfieUrl: string | null;
  idPhotoUrl: string | null;
  documentUrl: string | null;
  expiresAt: string;
}
export function parseReviewEvidence(body: unknown): ReviewEvidence | undefined {
  const parsed = callbackEvidence.safeParse(body);
  if (!parsed.success) return undefined;
  const data = parsed.data;
  const fields = data.id_fields;
  if (!fields && !data.image_links && !data.user_provided_info) return undefined;
  const selfieUrl = safeMedia(data.image_links?.selfie_image);
  const idPhotoUrl = safeMedia(fields?.photo_url);
  const documentUrl = safeMedia(fields?.document_link);
  const expires = Math.min(
    Date.now() + 10 * 60_000,
    ...[selfieUrl, idPhotoUrl, documentUrl].map(mediaExpiry),
  );
  return {
    status: data.status,
    fullName:
      fields?.full_name ||
      [fields?.first_name, fields?.other_names, fields?.last_name].filter(Boolean).join(' ') ||
      null,
    submittedName:
      [data.user_provided_info?.given_names, data.user_provided_info?.last_name]
        .filter(Boolean)
        .join(' ') || null,
    maskedId:
      fields?.id_number && fields.id_number.length > 4
        ? `•••••••${fields.id_number.slice(-4)}`
        : null,
    selfieUrl,
    idPhotoUrl,
    documentUrl,
    // Smile signs images for 15 minutes. Use a shorter review window.
    expiresAt: new Date(expires).toISOString(),
  };
}
const key = (reference: string) => `kyc:review:${reference}`;
export async function cacheReviewEvidence(
  redis: Redis | undefined,
  webhook: KycWebhook,
  result: KycResult,
) {
  if (
    !redis ||
    !webhook.evidence ||
    webhook.evidence.status !== result.providerStatus ||
    result.providerJobId !== webhook.jobId
  )
    return;
  await redis.set(
    key(webhook.referenceId),
    JSON.stringify({ jobId: webhook.jobId, evidence: webhook.evidence }),
    'EX',
    600,
  );
}
export async function readReviewEvidence(
  redis: Redis | undefined,
  reference: string | null,
  jobId: string | null,
): Promise<ReviewEvidence | null> {
  if (!redis || !reference || !jobId) return null;
  const raw = await redis.get(key(reference));
  if (!raw) return null;
  const cached = JSON.parse(raw) as { jobId: string; evidence: ReviewEvidence };
  return cached.jobId === jobId && Date.parse(cached.evidence.expiresAt) > Date.now()
    ? cached.evidence
    : null;
}
export function hasReviewPhotos(evidence: ReviewEvidence | null): boolean {
  return !!(
    evidence?.selfieUrl &&
    (evidence.idPhotoUrl || evidence.documentUrl) &&
    ['clear', 'attention', 'block'].includes(evidence.status)
  );
}
export function providerMetadata(value: unknown): { providerJobId?: string; environment?: string } {
  const parsed = z
    .object({ providerJobId: z.string().optional(), environment: z.string().optional() })
    .safeParse(value);
  return parsed.success
    ? {
        ...(parsed.data.providerJobId ? { providerJobId: parsed.data.providerJobId } : {}),
        ...(parsed.data.environment ? { environment: parsed.data.environment } : {}),
      }
    : {};
}
