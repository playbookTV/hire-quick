/**
 * Seeded QA test accounts (see packages/database/prisma/seed-test-accounts.ts).
 * Consumed only by the dev quick-login (gated by env.IS_DEV). Login uses the
 * explicitly enabled staging QA mode, so these numbers do not need SMS.
 * EXPO_PUBLIC_API_URL must point at that staging API.
 */
export interface DevAccount {
  label: string;
  sublabel: string;
  phone: string;
}

export const DEV_ACCOUNTS: readonly DevAccount[] = [
  { label: 'Client · Bisi Events', sublabel: 'Post jobs, review applicants', phone: '+2348100000001' },
  { label: 'Usher · Ada Okafor', sublabel: 'New — 0 jobs', phone: '+2348100000011' },
  { label: 'Usher · Chidi Eze', sublabel: '25 jobs — Premium Badge', phone: '+2348100000012' },
  { label: 'Usher · Ngozi Bello', sublabel: '60 jobs — Badge + Dress', phone: '+2348100000013' },
];
