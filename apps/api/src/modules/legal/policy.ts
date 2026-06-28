/**
 * The currently-published privacy policy, served by the legal router and
 * referenced by PolicyAcceptance rows. Bump `version` whenever the body changes
 * materially so prior acceptances remain attributable to the text the user saw.
 * The canonical, full-length source lives in
 * documentation/compliance/privacy-and-consent.md; this is the published, in-app
 * copy. (NDPR publication requirement.)
 */
export const PRIVACY_POLICY = {
  documentKey: 'privacy-policy',
  version: '2026-06-28',
  effectiveDate: '2026-06-28',
  body: `# HireQuick Privacy Policy

HireQuick connects clients with event staff in Lagos and holds payment in escrow
until verified attendance. This policy explains what we collect, why, and your
rights under the Nigeria Data Protection Regulation (NDPR).

## What we collect
- Account identity: phone number, optional email, role.
- Profile data: display name, bio, photos, languages, base area.
- Verification data (ushers): ID document and selfie, used solely to confirm
  identity, then deleted on the retention schedule below.
- Payment data: bank account details and payout references, retained for
  financial and tax compliance.
- Operational data: bookings, attendance, messages, reviews, disputes, and
  device tokens for notifications.

## Why we process it
To match staff to jobs, hold and release escrow, verify attendance, prevent
fraud, support disputes, and meet legal/financial obligations.

## Retention
- Verification documents: deleted 90 days after approval / 30 days after rejection.
- Chat: deleted ~180 days after the event (after the dispute window).
- Inactive device tokens: deleted after a period of inactivity.
- Financial and ledger records: retained for the statutory period and never
  deleted by an erasure request.

## Your rights
You may export your data or request erasure in-app. Erasure pseudonymises your
personal data while retaining financial records as the law requires. You may
grant or withdraw consent for push notifications and marketing at any time.

## Processors
We share data only as needed with our payment processor (Paystack), messaging
provider (Brevo), database host (Neon), and object storage, some of which may
process data outside Nigeria under appropriate safeguards.

## Contact
For privacy requests, use the in-app data tools or contact support.`,
} as const;
