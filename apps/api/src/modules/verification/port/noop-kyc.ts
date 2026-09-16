/** Missing provider configuration never supplies identity approval evidence. */
import { ApiError } from '../../../app.js';
import type { KycPort, KycResult, KycStartResult } from './kyc-port.js';

export class NoopKyc implements KycPort {
  startSession(_referenceId: string): Promise<KycStartResult> {
    return Promise.reject(
      new ApiError(503, 'KYC_UNAVAILABLE', 'identity verification is not configured'),
    );
  }
  getResult(_referenceId: string): Promise<KycResult> {
    return Promise.resolve({ decision: 'pending' });
  }
  verifyWebhook(): null {
    return null;
  }
}
