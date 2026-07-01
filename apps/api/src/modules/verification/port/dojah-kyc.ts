/**
 * Dojah (dojah.io) implementation of KycPort. The device runs the Dojah KYC
 * widget; results arrive server-to-server on the `kyc.widget` webhook, which we
 * parse here from the documented `government_data` payload. getResult re-fetches
 * by reference id as a backup when a webhook is missed.
 *
 * NOTE: requires a Dojah account (App ID + Secret Key) and a published EasyOnboard
 * flow (→ Widget ID). Without keys the app uses NoopKyc instead. The precise
 * fetch-by-reference endpoint depends on the account's flow config; getResult is
 * written defensively and the webhook payload is the primary authoritative path.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { logger } from '../../../logger.js';
import type { KycDecision, KycPort, KycResult, KycStartResult } from './kyc-port.js';

export interface DojahConfig {
  appId: string;
  secretKey: string;
  widgetId: string;
  baseUrl?: string; // defaults to production
}

/** Decide a verdict from the provider's biometric + lookup signals. */
function decide(signals: { livenessPassed?: boolean | undefined; faceMatch?: boolean | undefined; idFound?: boolean | undefined; watchListed?: boolean | undefined }): {
  decision: KycDecision;
  reasonCode?: string;
} {
  if (signals.watchListed) return { decision: 'rejected', reasonCode: 'WATCHLISTED' };
  if (signals.idFound === false) return { decision: 'rejected', reasonCode: 'ID_NOT_FOUND' };
  if (signals.livenessPassed === false) return { decision: 'rejected', reasonCode: 'LIVENESS_FAILED' };
  if (signals.faceMatch === false) return { decision: 'rejected', reasonCode: 'SELFIE_MISMATCH' };
  // Strong pass requires positive liveness + face-match + an ID hit.
  if (signals.livenessPassed && signals.faceMatch && signals.idFound) return { decision: 'verified' };
  return { decision: 'pending' };
}

/** Pull a KycResult out of a Dojah `kyc.widget` payload (`data.government_data` etc.). */
function parseDojahPayload(body: Record<string, unknown>): { referenceId: string; result: KycResult } | null {
  const data = (body.data ?? body) as Record<string, unknown>;
  const referenceId =
    (typeof data.reference_id === 'string' && data.reference_id) ||
    (typeof data.referenceId === 'string' && data.referenceId) ||
    (typeof body.reference_id === 'string' && body.reference_id) ||
    null;
  if (!referenceId) return null;

  const gov = (data.government_data ?? {}) as Record<string, unknown>;
  const entity = (gov.entity ?? gov.data ?? gov) as Record<string, unknown>;
  const selfie = (data.selfie ?? data.selfie_verification ?? {}) as Record<string, unknown>;

  const nin = typeof entity.nin === 'string' ? entity.nin : undefined;
  const bvn = typeof entity.bvn === 'string' ? entity.bvn : undefined;
  const watchListed = typeof entity.watch_listed === 'boolean' ? entity.watch_listed : entity.watch_listed === 'true' || undefined;
  const livenessPassed = typeof selfie.liveness_check === 'boolean' ? selfie.liveness_check : typeof data.liveness === 'boolean' ? data.liveness : undefined;
  const faceMatchScore = typeof selfie.confidence_value === 'number' ? selfie.confidence_value : typeof selfie.match_score === 'number' ? selfie.match_score : undefined;
  const faceMatch = typeof selfie.match === 'boolean' ? selfie.match : faceMatchScore !== undefined ? faceMatchScore >= 60 : undefined;
  const idFound = nin !== undefined || bvn !== undefined ? true : undefined;
  const govPhotoBase64 = typeof entity.image === 'string' ? entity.image : typeof entity.photo === 'string' ? entity.photo : undefined;

  const { decision, reasonCode } = decide({ livenessPassed, faceMatch, idFound, watchListed: watchListed === true });

  return {
    referenceId,
    result: { decision, reasonCode, nin, bvn, livenessPassed, faceMatchScore, watchListed: watchListed === true ? true : undefined, govPhotoBase64, raw: body },
  };
}

export class DojahKyc implements KycPort {
  private readonly base: string;

  constructor(private readonly cfg: DojahConfig) {
    this.base = (cfg.baseUrl ?? 'https://api.dojah.io').replace(/\/$/, '');
  }

  startSession(referenceId: string): Promise<KycStartResult> {
    return Promise.resolve({ widgetId: this.cfg.widgetId, referenceId });
  }

  async getResult(referenceId: string): Promise<KycResult> {
    try {
      const res = await fetch(`${this.base}/api/v1/kyc/widget/data?reference_id=${encodeURIComponent(referenceId)}`, {
        headers: { Authorization: this.cfg.secretKey, AppId: this.cfg.appId },
      });
      if (!res.ok) return { decision: 'pending' };
      const body = (await res.json()) as Record<string, unknown>;
      const parsed = parseDojahPayload(body);
      return parsed?.result ?? { decision: 'pending' };
    } catch (e) {
      logger.warn({ err: e, referenceId }, 'dojah getResult failed');
      return { decision: 'pending' };
    }
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): { referenceId: string; result: KycResult } | null {
    // Optional HMAC check when a signature header is configured on the Dojah side.
    const sigHeader = headers['x-dojah-signature'] ?? headers['x-dojah-hmac'];
    const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
    if (sig) {
      const expected = createHmac('sha256', this.cfg.secretKey).update(rawBody).digest('hex');
      const a = Buffer.from(expected);
      const b = Buffer.from(sig);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        logger.warn('dojah webhook signature mismatch');
        return null;
      }
    }
    try {
      return parseDojahPayload(JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>);
    } catch {
      return null;
    }
  }
}
