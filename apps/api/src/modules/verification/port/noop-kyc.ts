/**
 * No-op KYC provider so the app boots and tests run with no Dojah account/keys
 * (same role as InMemoryPaystack). `startSession` hands back a placeholder widget
 * id; `getResult` reports pending; `verifyWebhook` parses a simple test-shaped
 * JSON body so the webhook endpoint can be exercised end-to-end in unit tests.
 *
 * Test webhook body shape (JSON):
 *   { "referenceId": "...", "decision": "verified|pending|rejected",
 *     "reasonCode"?, "nin"?, "bvn"?, "livenessPassed"?, "faceMatchScore"?, "watchListed"? }
 */
import type { KycPort, KycResult, KycStartResult } from './kyc-port.js';

export class NoopKyc implements KycPort {
  startSession(referenceId: string): Promise<KycStartResult> {
    return Promise.resolve({ widgetId: 'noop-widget', referenceId });
  }

  getResult(_referenceId: string): Promise<KycResult> {
    return Promise.resolve({ decision: 'pending' });
  }

  verifyWebhook(rawBody: Buffer): { referenceId: string; result: KycResult } | null {
    try {
      const body = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
      const referenceId = typeof body.referenceId === 'string' ? body.referenceId : null;
      const decision = body.decision;
      if (!referenceId || (decision !== 'verified' && decision !== 'pending' && decision !== 'rejected')) {
        return null;
      }
      const result: KycResult = {
        decision,
        reasonCode: typeof body.reasonCode === 'string' ? body.reasonCode : undefined,
        nin: typeof body.nin === 'string' ? body.nin : undefined,
        bvn: typeof body.bvn === 'string' ? body.bvn : undefined,
        livenessPassed: typeof body.livenessPassed === 'boolean' ? body.livenessPassed : undefined,
        faceMatchScore: typeof body.faceMatchScore === 'number' ? body.faceMatchScore : undefined,
        watchListed: typeof body.watchListed === 'boolean' ? body.watchListed : undefined,
        raw: body,
      };
      return { referenceId, result };
    } catch {
      return null;
    }
  }
}
