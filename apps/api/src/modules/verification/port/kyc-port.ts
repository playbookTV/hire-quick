import type { ReviewEvidence } from '../evidence.js';
/** Provider boundary. Only authenticated server evidence may settle identity. */
export interface KycIdentity {
  idType: 'NIN' | 'BVN';
  idNumber: string;
  givenNames: string;
  lastName: string;
  email?: string | undefined;
}
export interface KycStartResult {
  referenceId: string;
  token: string;
  partnerId: string;
  sandbox: boolean;
  privacyPolicyUrl: string;
}
/** Typed names against the ID record; see name-match.ts. */
export type NameCheck = 'matched' | 'partial' | 'mismatch' | 'unavailable';
export interface KycResult {
  decision: 'verified' | 'pending' | 'rejected';
  reasonCode?: string | undefined;
  /** Applicant-facing explanation for an automatic rejection. */
  reason?: string | undefined;
  nameCheck?: NameCheck | undefined;
  livenessPassed?: boolean | undefined;
  faceMatchScore?: number | undefined;
  watchListed?: boolean | undefined;
  idFound?: boolean | undefined;
  providerJobId?: string | undefined;
  providerStatus?: string | undefined;
}
export interface KycWebhook {
  referenceId: string;
  jobId: string;
  userId: string;
  evidence?: ReviewEvidence | undefined;
}
export interface KycPort {
  verifyBusiness?(input: BusinessLookup): Promise<BusinessLookupResult>;
  businessResult?(input: BusinessLookup): Promise<BusinessLookupResult>;
  startSession(referenceId: string, identity: KycIdentity, phone: string): Promise<KycStartResult>;
  getResult(jobId: string, userId: string): Promise<KycResult>;
  refreshEvidence?(jobId: string, referenceId: string, environment?: string): Promise<void>;
  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
    referenceId: string,
    callbackKey: string,
  ): KycWebhook | null;
}

export interface BusinessLookup {
  referenceId: string;
  clientId: string;
  registrationNumber: string;
  businessType: 'co' | 'bn' | 'it';
}
export interface BusinessLookupResult {
  status: 'VERIFIED' | 'NOT_FOUND' | 'UNAVAILABLE';
  registeredName: string | null;
  providerJobId: string | null;
  environment: 'sandbox' | 'production';
}
