/** Dojah's documented raw-body signature and reference-bound verification API. */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { logger } from '../../../logger.js';
import type { KycPort, KycResult, KycStartResult } from './kyc-port.js';

export interface DojahConfig {
  appId: string;
  secretKey: string;
  widgetId: string;
  baseUrl?: string;
}

const object = z.record(z.unknown());
function record(value: unknown): Record<string, unknown> {
  const parsed = object.safeParse(value);
  return parsed.success ? parsed.data : {};
}
function nonempty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}
function score(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : undefined;
}

/** Completed means finished, not passed: require successful checks and explicit face evidence. */
function parseDojahPayload(value: unknown): { referenceId: string; result: KycResult } | null {
  const body = record(value);
  const referenceId = nonempty(body.reference_id);
  if (!referenceId) return null;
  const data = record(body.data);
  const gov = record(data.government_data);
  const govData = record(gov.data);
  const ninEntity = record(record(govData.nin).entity);
  const bvnEntity = record(record(govData.bvn).entity);
  const nin = nonempty(ninEntity.nin);
  const bvn = nonempty(bvnEntity.bvn);
  const selfie = record(data.selfie);
  const selfieData = record(selfie.data);
  const faceMatchScore = score(selfieData.match_score);
  const watchListed = ninEntity.watch_listed === true || bvnEntity.watch_listed === true;
  const result: KycResult = {
    decision: 'pending',
    nin,
    bvn,
    watchListed,
    livenessPassed: typeof selfie.status === 'boolean' ? selfie.status : undefined,
    faceMatchScore,
  };
  const finish = (decision: KycResult['decision'], reasonCode?: string) => ({
    referenceId,
    result: { ...result, decision, ...(reasonCode ? { reasonCode } : {}) },
  });
  // Partial/out-of-order progress is never sufficient to approve or reject.
  if (body.verification_status === 'Failed') return finish('rejected', 'OTHER');
  if (body.verification_status !== 'Completed') return finish('pending');
  if (watchListed) return finish('rejected', 'WATCHLISTED');
  if (gov.status === false) return finish('rejected', 'ID_NOT_FOUND');
  if (selfie.status === false) return finish('rejected', 'LIVENESS_FAILED');
  if (faceMatchScore !== undefined && faceMatchScore < 60)
    return finish('rejected', 'SELFIE_MISMATCH');
  // A failed optional step still prevents an automatic pass. Do not infer a
  // watchlist match from a generic AML failure/error.
  if (
    body.status === false ||
    record(body.aml).status === false ||
    Object.values(data).some((step) => record(step).status === false)
  )
    return finish('rejected', 'OTHER');
  if (
    body.status === true &&
    gov.status === true &&
    selfie.status === true &&
    (nin || bvn) &&
    faceMatchScore !== undefined &&
    faceMatchScore >= 60
  )
    return finish('verified');
  return finish('pending');
}

export class DojahKyc implements KycPort {
  private readonly base: string;
  constructor(
    private readonly cfg: DojahConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.base = (cfg.baseUrl ?? 'https://api.dojah.io').replace(/\/$/, '');
  }

  startSession(referenceId: string): Promise<KycStartResult> {
    return Promise.resolve({ widgetId: this.cfg.widgetId, referenceId });
  }

  async getResult(referenceId: string): Promise<KycResult> {
    try {
      // https://docs.dojah.io/api-reference/verifications/get-verification
      const res = await this.fetchImpl(
        `${this.base}/api/v1/kyc/verification?reference_id=${encodeURIComponent(referenceId)}`,
        {
          headers: { Authorization: this.cfg.secretKey, AppId: this.cfg.appId },
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!res.ok) return { decision: 'pending' };
      const parsed = parseDojahPayload(await res.json());
      return parsed?.referenceId === referenceId ? parsed.result : { decision: 'pending' };
    } catch {
      // Provider errors may include sensitive identity bodies; log no raw error.
      logger.warn({ referenceId }, 'dojah getResult unavailable');
      return { decision: 'pending' };
    }
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>) {
    // https://docs.dojah.io/api-reference/core-concepts/webhooks-signatures
    // Every delivery supplies this HMAC header. The secret-only v2 signature
    // and undocumented aliases are not substitutes for authenticating the body.
    const signature = headers['x-dojah-signature'];
    if (
      !this.cfg.secretKey ||
      typeof signature !== 'string' ||
      !/^[a-fA-F0-9]{64}$/.test(signature)
    )
      return null;
    const expected = createHmac('sha256', this.cfg.secretKey).update(rawBody).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return null;
    try {
      return parseDojahPayload(JSON.parse(rawBody.toString('utf8')));
    } catch {
      return null;
    }
  }
}
