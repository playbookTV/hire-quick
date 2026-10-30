import { createHmac } from 'node:crypto';
import { z } from 'zod';
import type { BusinessLookup, BusinessLookupResult } from './kyc-port.js';
import type { SmileConfig } from './smile-kyc.js';

const resultSchema = z.object({
  PartnerParams: z.object({
    job_id: z.string(),
    user_id: z.string(),
    job_type: z.union([z.literal(7), z.literal('7')]),
  }),
  ResultCode: z.string(),
  SmileJobID: z.string().optional(),
  Actions: z.object({ Verify_Business: z.string() }).optional(),
  company_information: z
    .object({
      legal_name: z.string().max(300),
      registration_number: z.string(),
      status: z.string().optional(),
    })
    .optional(),
});

/** V1 KYB is still the supported contract; never reuse the V3 biometric verdict parser. */
export async function lookupSmileBusiness(
  cfg: SmileConfig,
  input: BusinessLookup,
  fetchImpl: typeof fetch,
  existing = false,
): Promise<BusinessLookupResult> {
  const unavailable: BusinessLookupResult = {
    status: 'UNAVAILABLE',
    registeredName: null,
    providerJobId: null,
    environment: cfg.environment,
  };
  try {
    const timestamp = new Date().toISOString();
    const signature = createHmac('sha256', cfg.apiKey)
      .update(timestamp)
      .update(cfg.partnerId)
      .update('sid_request')
      .digest('base64');
    const base =
      cfg.environment === 'production'
        ? 'https://api.smileidentity.com'
        : 'https://testapi.smileidentity.com';
    const response = await fetchImpl(
      `${base}/v1/${existing ? 'job_status' : 'business_verification'}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          partner_id: cfg.partnerId,
          timestamp,
          signature,
          ...(existing
            ? {
                job_id: input.referenceId,
                user_id: input.clientId,
                history: false,
                image_links: false,
              }
            : {
                source_sdk: 'rest_api',
                source_sdk_version: '1.0.0',
                country: 'NG',
                id_type: 'BUSINESS_REGISTRATION',
                id_number: input.registrationNumber,
                business_type: input.businessType,
                partner_params: { job_id: input.referenceId, user_id: input.clientId, job_type: 7 },
              }),
        }),
      },
    );
    if (!response.ok) return unavailable;
    const raw: unknown = await response.json();
    const envelope = existing
      ? z.object({ job_complete: z.literal(true), result: z.unknown() }).safeParse(raw)
      : null;
    const parsed = resultSchema.safeParse(
      existing ? (envelope?.success ? envelope.data.result : null) : raw,
    );
    if (!parsed.success) return unavailable;
    const result = parsed.data;
    if (
      result.PartnerParams.job_id !== input.referenceId ||
      result.PartnerParams.user_id !== input.clientId
    )
      return unavailable;
    const company = result.company_information;
    const normalize = (value: string) =>
      value
        .toUpperCase()
        .replace(/^(RC|BN|IT)\s*/, '')
        .replace(/[^A-Z0-9]/g, '');
    const verified =
      result.ResultCode === '1012' &&
      result.Actions?.Verify_Business === 'Verified' &&
      !!company?.legal_name.trim() &&
      normalize(company.registration_number) === normalize(input.registrationNumber) &&
      ['ACTIVE', 'VERIFIED'].includes(company.status?.toUpperCase() ?? '');
    return {
      ...unavailable,
      status: verified ? 'VERIFIED' : result.ResultCode === '1013' ? 'NOT_FOUND' : 'UNAVAILABLE',
      registeredName: verified ? company!.legal_name : null,
      providerJobId: result.SmileJobID ?? null,
    };
  } catch {
    // Provider bodies contain third-party identities; never attach them to errors or telemetry.
    return unavailable;
  }
}
