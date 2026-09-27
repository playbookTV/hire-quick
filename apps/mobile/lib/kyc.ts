/** Session secrets and identity fields are kept only in component memory. */
import { api } from './client.js';
export interface KycIdentity {
  idType: 'NIN' | 'BVN';
  idNumber: string;
  givenNames: string;
  lastName: string;
  email?: string | undefined;
}
export interface KycSession {
  referenceId: string;
  token: string;
  partnerId: string;
  sandbox: boolean;
  privacyPolicyUrl: string;
}
export const startKyc = (identity: KycIdentity, referenceId?: string) =>
  api.post<KycSession>('/api/me/verification/kyc/start', {
    ...identity,
    email: identity.email?.trim() || undefined,
    referenceId,
  });
export interface SmileCaptureProps {
  session: KycSession;
  identity: KycIdentity;
  onSubmitted: () => void;
  onCancelled: () => void;
  onFailure: () => void;
}
