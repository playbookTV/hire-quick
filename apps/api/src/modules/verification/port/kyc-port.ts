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
export interface KycResult {
  decision: 'verified' | 'pending' | 'rejected';
  reasonCode?: string | undefined;
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
}
export interface KycPort {
  startSession(referenceId: string, identity: KycIdentity, phone: string): Promise<KycStartResult>;
  getResult(jobId: string, userId: string): Promise<KycResult>;
  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
    referenceId: string,
    callbackKey: string,
  ): KycWebhook | null;
}
