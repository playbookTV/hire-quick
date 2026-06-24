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

export interface Wallet {
  id: string;
  availableBalance: number;
  currency: string;
}

/** A portfolio work sample. `imageUrl` is a short-lived presigned GET URL. */
export interface PortfolioPhoto {
  id: string;
  imageUrl: string;
}

export interface UsherProfile {
  id: string;
  userId: string;
  displayName: string | null;
  bio: string | null;
  yearsExperience: number;
  verificationStatus: UsherVerifyState;
  reliabilityScore: number;
  ratingAvg: number;
  ratingCount: number;
  completedJobsCount: number;
  wallet?: Wallet | null;
  /** Presigned profile-photo URL; null = render initials. */
  avatarUrl: string | null;
  portfolio: PortfolioPhoto[];
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

/** GET /api/ushers[/:id] — discovery card / usher profile. */
export interface UsherListItem {
  id: string;
  displayName: string | null;
  bio: string | null;
  yearsExperience: number;
  ratingAvg: number;
  ratingCount: number;
  completedJobsCount: number;
  reliabilityScore: number;
  verificationStatus: UsherVerifyState;
  /** Presigned profile-photo URL; null = render initials. */
  avatarUrl: string | null;
  /** Only present on the single-usher detail (`GET /api/ushers/:id`). */
  portfolio?: PortfolioPhoto[];
}

/** GET /api/ushers/:id/reviews */
export interface Review {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewerName: string;
}

/** GET /api/bookings[/:id] */
export interface Booking {
  id: string;
  eventId: string;
  usherId: string;
  status: string;
  amount: number;
  createdAt: string;
  /** Enriched on list/detail: event summary + the host (client) name. */
  event?: Partial<EventResource> & { title: string; eventDate: string; startTime: string; client?: { displayName: string } };
  /** Enriched on list: the booked usher's name/phone. */
  usher?: { displayName: string | null; user: { phone: string } };
}

/** GET /api/bookings/:id/messages */
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  contentType: 'TEXT' | 'IMAGE' | 'VOICE';
  content: string;
  flagged: boolean;
  createdAt: string;
}

export type ApplicationStatus = 'APPLIED' | 'SHORTLISTED' | 'ACCEPTED' | 'REJECTED';

/** GET /api/events/:id/applications */
export interface Application {
  id: string;
  status: ApplicationStatus;
  createdAt: string;
  usher: {
    id: string;
    displayName?: string | null;
    completedJobsCount: number;
    ratingAvg: number;
    yearsExperience: number;
    verificationStatus: UsherVerifyState;
    bio: string | null;
    avatarUrl: string | null;
    user: { phone: string };
  };
}

/** GET /api/me/applications — the usher's own applications, with the event. */
export interface MyApplication {
  id: string;
  status: ApplicationStatus;
  createdAt: string;
  event: EventResource;
}

/** GET /api/payments/banks */
export interface Bank {
  name: string;
  code: string;
}

/** GET /api/payments/wallet */
export interface WalletSummary {
  availableBalance: number;
  pendingEscrow: number;
  lifetimeEarned: number;
}

/** GET /api/payments/wallet/activity */
export interface WalletActivity {
  id: string;
  type: 'credit' | 'debit' | 'pending';
  title: string;
  subtitle: string;
  amount: number;
  createdAt: string;
}

/** GET /api/payments/bank-accounts */
export interface BankAccount {
  id: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  verified: boolean;
}

/** GET /api/me/availability */
export interface Availability {
  id: string;
  date: string;
  status: 'AVAILABLE' | 'UNAVAILABLE';
}

/** POST /api/events/:id/confirm → order + bookings + Paystack init. */
export interface ConfirmResult {
  orderId: string;
  bookingIds: string[];
  authorizationUrl: string;
  reference: string;
}
