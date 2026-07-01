/**
 * Canonical domain enums (TRD §6). These are the single source of truth; the
 * Prisma schema mirrors them and the UX labels map onto them (UXRD §9).
 */

export const USER_ROLES = ['CLIENT', 'USHER', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const VERIFICATION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const EVENT_STATUSES = [
  'DRAFT',
  'OPEN',
  'PARTIALLY_STAFFED',
  'FULLY_STAFFED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const APPLICATION_STATUSES = ['APPLIED', 'SHORTLISTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const INVITATION_STATUSES = ['SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/** Booking lifecycle (TRD §6/§12). `IN_PROGRESS` from UXRD §9 is display-only, not a stored value. */
export const BOOKING_STATUSES = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'CHECKED_IN',
  'COMPLETED',
  'PAID',
  'CANCELLED',
  'NO_SHOW',
  'DISPUTED',
  'REFUNDED',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** How a booking reached CHECKED_IN/COMPLETED. AUTO = client-passive auto-complete (D1, §12). */
export const ATTENDANCE_METHODS = ['OTP', 'QR', 'AUTO'] as const;
export type AttendanceMethod = (typeof ATTENDANCE_METHODS)[number];

/** Batch-charge aggregate (TRD §6, P1-4): one order → N bookings. */
export const ORDER_STATUSES = ['PENDING', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ESCROW_STATUSES = ['HELD', 'RELEASED', 'REFUNDED', 'FROZEN'] as const;
export type EscrowStatus = (typeof ESCROW_STATUSES)[number];

/** Append-only escrow ledger entry types (TRD §6, incl. v2.1 COMMISSION_SWEEP). */
export const LEDGER_ENTRY_TYPES = [
  'HOLD',
  'RELEASE',
  'REFUND',
  'FEE',
  'REVERSAL',
  'COMMISSION_SWEEP',
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

/** Append-only wallet ledger entry types (TRD §6, v2.1 held-wallet model). */
export const WALLET_ENTRY_TYPES = ['CREDIT', 'DEBIT', 'REVERSAL'] as const;
export type WalletEntryType = (typeof WALLET_ENTRY_TYPES)[number];

export const WITHDRAWAL_STATUSES = ['REQUESTED', 'PROCESSING', 'PAID', 'FAILED'] as const;
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number];

export const DISPUTE_STATUSES = ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED'] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

/** OTP/code purposes for `verification_codes` (TRD §6 v2.1). */
export const CODE_PURPOSES = ['AUTH', 'ATTENDANCE'] as const;
export type CodePurpose = (typeof CODE_PURPOSES)[number];

export const DEVICE_PLATFORMS = ['IOS', 'ANDROID'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

/** Late-night accommodation disclosure on a job posting (required when endTime >= 22:00). */
export const ACCOMMODATION_STATUSES = ['PROVIDED', 'NOT_PROVIDED'] as const;
export type AccommodationStatus = (typeof ACCOMMODATION_STATUSES)[number];

/** Reward fulfilment mode. BADGE auto-fulfils on unlock; PHYSICAL awaits admin. */
export const REWARD_TYPES = ['BADGE', 'PHYSICAL'] as const;
export type RewardType = (typeof REWARD_TYPES)[number];

/** Lifecycle of an usher's unlocked milestone reward. */
export const MILESTONE_STATUSES = ['UNLOCKED', 'FULFILLED'] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

/** Persisted notification kinds; each maps to a deep-link target on the mobile client. */
export const NOTIFICATION_TYPES = [
  'INVITATION_RECEIVED',
  'APPLICATION_RECEIVED',
  'BOOKING_CONFIRMED',
  'PAYOUT_RELEASED',
  'NEW_MESSAGE',
  'DISPUTE_OPENED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Nigeria's 36 states + the FCT. Powers usher↔job state matching and the location pickers. */
export const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River',
  'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina',
  'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau',
  'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara', 'FCT - Abuja',
] as const;
export type NigerianState = (typeof NIGERIAN_STATES)[number];
