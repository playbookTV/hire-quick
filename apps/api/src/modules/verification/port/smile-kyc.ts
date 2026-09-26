/** Smile ID v3 API / v12 mobile SDK. See docs/SMILE-ID.md for the trust boundary. */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../../../app.js';
import type { KycIdentity, KycPort, KycResult, KycStartResult } from './kyc-port.js';

export interface SmileConfig {
  partnerId: string;
  apiKey: string;
  environment: 'sandbox' | 'production';
  callbackUrl: string;
  privacyPolicyUrl: string;
}
const jobIdSchema = z.string().regex(/^job_[0-9a-hjkmnp-tv-z]{26}$/);
const callbackSchema = z.object({
  product: z.literal('biometric_kyc'),
  partner_params: z.object({ job_id: jobIdSchema, user_id: z.string().min(1) }),
});
function equal(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export class SmileKyc implements KycPort {
  private readonly base: string;
  constructor(
    private readonly cfg: SmileConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.base =
      cfg.environment === 'production'
        ? 'https://api.smileidentity.com'
        : 'https://testapi.smileidentity.com';
  }
  private callbackKey(referenceId: string): string {
    return createHmac('sha256', this.cfg.apiKey)
      .update(`hirequick:smile-callback:${referenceId}`)
      .digest('hex');
  }
  private async token(body?: FormData): Promise<string> {
    const res = await this.fetchImpl(`${this.base}/v3/token`, {
      method: 'POST',
      headers: { 'SmileID-Partner-ID': this.cfg.partnerId, 'SmileID-API-Key': this.cfg.apiKey },
      ...(body ? { body } : {}),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error('Smile token unavailable');
    return z.object({ token: z.string().min(1) }).parse(await res.json()).token;
  }
  async startSession(
    referenceId: string,
    identity: KycIdentity,
    phone: string,
  ): Promise<KycStartResult> {
    // Token-bound callback_url is replaced by Smile with an opaque callback_ id.
    // Its secret URL is never returned to the device. A timestamp signature alone
    // does NOT bind the webhook body, so the per-attempt callback capability matters.
    const body = new FormData();
    body.set('product', 'biometric_kyc');
    body.set('partner_params', JSON.stringify({ reference_id: referenceId }));
    body.set(
      'payload',
      JSON.stringify({
        country: 'NG',
        id_type: identity.idType === 'NIN' ? 'NIN_V2' : 'BVN',
        id_number: identity.idNumber,
        given_names: identity.givenNames,
        last_name: identity.lastName,
        ...(identity.email ? { email: identity.email } : {}),
        // Sandbox fixtures use their documented email; keep the account's real phone local.
        ...(this.cfg.environment === 'production' ? { phone_number: phone } : {}),
        callback_url: `${this.cfg.callbackUrl.replace(/\/$/, '')}/${referenceId}/${this.callbackKey(referenceId)}`,
      }),
    );
    try {
      const token = await this.token(body);
      return {
        referenceId,
        token,
        partnerId: this.cfg.partnerId,
        sandbox: this.cfg.environment === 'sandbox',
        privacyPolicyUrl: this.cfg.privacyPolicyUrl,
      };
    } catch {
      // Do not leak provider responses, tokens, or identity fields through errors/logs.
      throw new ApiError(
        503,
        'KYC_UNAVAILABLE',
        'Identity verification is temporarily unavailable. Please try again.',
      );
    }
  }
  verifyWebhook(
    raw: Buffer,
    headers: Record<string, string | string[] | undefined>,
    referenceId: string,
    callbackKey: string,
  ) {
    if (
      !z.string().uuid().safeParse(referenceId).success ||
      !equal(this.callbackKey(referenceId), callbackKey)
    )
      return null;
    const timestamp = headers['response-timestamp'];
    const signature = headers['response-signature'];
    if (typeof timestamp !== 'string' || typeof signature !== 'string' || !this.cfg.apiKey)
      return null;
    const expected = createHmac('sha256', this.cfg.apiKey)
      .update(timestamp + this.cfg.partnerId + 'sid_request')
      .digest('base64');
    if (!equal(expected, signature)) return null;
    try {
      const parsed = callbackSchema.parse(JSON.parse(raw.toString('utf8')));
      return {
        referenceId,
        jobId: parsed.partner_params.job_id,
        userId: parsed.partner_params.user_id,
      };
    } catch {
      return null;
    }
  }
  async getResult(jobId: string, userId: string): Promise<KycResult> {
    if (!jobIdSchema.safeParse(jobId).success) return { decision: 'pending' };
    try {
      const token = await this.token();
      const res = await this.fetchImpl(`${this.base}/v3/status/${encodeURIComponent(jobId)}`, {
        headers: { 'SmileID-Partner-ID': this.cfg.partnerId, 'SmileID-Token': token },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error('Smile status unavailable');
      const result = z
        .object({ job_id: z.string(), user_id: z.string(), status: z.string() })
        .parse(await res.json());
      if (result.job_id !== jobId || result.user_id !== userId)
        throw new Error('Smile result mismatch');
      // attention/error/unknown need review or retry, never automatic approval.
      return {
        decision:
          result.status === 'clear'
            ? 'verified'
            : result.status === 'block'
              ? 'rejected'
              : 'pending',
        ...(result.status === 'block' ? { reasonCode: 'OTHER' } : {}),
        providerJobId: jobId,
        providerStatus: result.status,
      };
    } catch {
      // A retryable response makes Smile redeliver instead of losing a callback.
      throw new ApiError(503, 'KYC_UNAVAILABLE', 'Verification result is temporarily unavailable');
    }
  }
}
