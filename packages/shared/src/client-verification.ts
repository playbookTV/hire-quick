import { z } from 'zod';

export const CLIENT_ACCOUNT_TYPES = ['INDIVIDUAL', 'BUSINESS'] as const;
export type ClientAccountType = (typeof CLIENT_ACCOUNT_TYPES)[number];

export interface ClientVerificationState {
  accountType?: ClientAccountType | null;
  verificationStatus?: string;
  businessVerificationStatus?: string;
}

export function clientCanHire(client: ClientVerificationState | null | undefined): boolean {
  return (
    !!client &&
    client.verificationStatus === 'VERIFIED' &&
    (client.accountType === 'INDIVIDUAL' ||
      (client.accountType === 'BUSINESS' && client.businessVerificationStatus === 'VERIFIED'))
  );
}

export function clientTrustLabel(client: ClientVerificationState | null | undefined) {
  if (client?.verificationStatus !== 'VERIFIED') return null;
  return client.accountType === 'BUSINESS' && client.businessVerificationStatus === 'VERIFIED'
    ? 'Business verified'
    : 'Identity verified';
}

export const businessVerificationSchema = z.object({
  registeredName: z.string().trim().min(2).max(160),
  registrationNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9 /-]{1,39}$/),
  businessType: z.enum(['co', 'bn', 'it']),
  representativeRole: z.string().trim().min(2).max(100),
  authorizationKey: z.string().min(1).max(500),
  authorized: z.literal(true),
});
export type BusinessVerificationInput = z.infer<typeof businessVerificationSchema>;
