/**
 * Shapes of the API resources the mobile app consumes. Enums come from
 * `@hq/shared` so client and server agree; the rest mirror the Prisma rows the
 * routes return (money fields are integer kobo).
 */
import type { UserRole, EventStatus } from '@hq/shared';

export type UsherVerifyState = 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface ClientProfile {
  id: string;
  userId: string;
  displayName: string;
  ratingAvg: number;
  ratingCount: number;
}

export interface UsherProfile {
  id: string;
  userId: string;
  bio: string | null;
  yearsExperience: number;
  verificationStatus: UsherVerifyState;
  reliabilityScore: number;
  ratingAvg: number;
  ratingCount: number;
  completedJobsCount: number;
}

/** GET /api/me */
export interface Me {
  id: string;
  role: UserRole;
  phone: string;
  email: string | null;
  status: string;
  client: ClientProfile | null;
  usher: UsherProfile | null;
}

/** Event row (GET /api/events, /api/events/:id). `budgetPerHead` is kobo. */
export interface EventResource {
  id: string;
  clientId: string;
  title: string;
  venue: string;
  category: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  headcount: number;
  budgetPerHead: number;
  dressCode: string | null;
  accommodation: 'PROVIDED' | 'NOT_PROVIDED' | null;
  preferences: { requirements?: string } | null;
  status: EventStatus;
  createdAt: string;
  _count?: { applications: number; bookings: number };
}

/** POST /auth/otp/verify */
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; role: UserRole; phone: string };
}
