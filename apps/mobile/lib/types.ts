/**
 * Shapes of the API resources the mobile app consumes. Enums come from
 * `@hq/shared` so client and server agree; the rest mirror the Prisma rows the
 * routes return (money fields are integer kobo).
 */
import type { UserRole, EventStatus, NotificationType } from '@hq/shared';

export type UsherVerifyState = 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface ClientProfile {
  id: string;
  userId: string;
  displayName: string;
  businessName: string | null;
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
  /** Nigerian state; ushers only see jobs in their state. */
  state: string | null;
  /** Base area in Lagos; powers discovery's location filter. */
  city: string | null;
  /** Spoken languages; powers discovery's language filter. */
  languages: string[];
  /** Indicative day rate in kobo — display + discovery filter only (no escrow impact). */
  dayRateKobo: number | null;
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
  state: string | null;
  category: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  headcount: number;
  budgetPerHead: number;
  dressCode: string | null;
  accommodation: 'PROVIDED' | 'NOT_PROVIDED' | null;
  preferences: { requirements?: string; hairstyle?: string } | null;
  status: EventStatus;
  createdAt: string;
  _count?: { applications: number; bookings: number };
}

/** GET /api/me/notifications — one persisted inbox row. */
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Deep-link subject, e.g. "invitation" / "booking". */
  targetType: string | null;
  targetId: string | null;
  /** Null until read. */
  readAt: string | null;
  createdAt: string;
}

/** GET /api/me/notifications envelope. */
export interface NotificationFeed {
  notifications: Notification[];
  unreadCount: number;
}

/** GET /api/me/invitations[/:id] — an invitation with its event + inviting client. */
export interface Invitation {
  id: string;
  eventId: string;
  usherId: string;
  status: 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
  createdAt: string;
  event: EventResource & { client: { displayName: string; businessName: string | null } };
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
  city: string | null;
  languages: string[];
  /** Indicative day rate in kobo — display + discovery filter only. */
  dayRateKobo: number | null;
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
  /** Detail response only; never confuse gross booking amount with net earnings. */
  payment?: {
    grossAmount: number;
    platformFee: number;
    usherPayout: number;
    escrowStatus: string;
  } | null;
  createdAt: string;
  /** Enriched on list/detail: event summary + the host (client) name. */
  event?: Partial<EventResource> & {
    title: string;
    eventDate: string;
    startTime: string;
    client?: { displayName: string };
  };
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
    // NB: contact details (user.phone) are intentionally NOT sent by the
    // applications endpoint — they stay off-platform until a booking exists.
    // displayName is the source of name here; fall back to 'Usher' if null.
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
