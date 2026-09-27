# Route and verification inventory

Mobile routes below were read from source; D indicates deeper state/control review and S broad source screening. Neither indicates interaction testing.

| Mobile route | Source review |
|---|---|
| (auth)/complete-profile.tsx | D |
| (auth)/otp.tsx | D |
| (auth)/phone.tsx | D |
| (auth)/role.tsx | S |
| (auth)/welcome.tsx | S |
| (client)/discover.tsx | D |
| (client)/events/[id].tsx | D |
| (client)/events/index.tsx | S |
| (client)/home.tsx | S |
| (client)/messages.tsx | S |
| (client)/profile.tsx | S |
| (modals)/applications.tsx | D |
| (modals)/cancellation.tsx | D |
| (modals)/check-in.tsx | D |
| (modals)/create-event.tsx | D |
| (modals)/dispute.tsx | D |
| (modals)/edit-event.tsx | D |
| (modals)/edit-profile.tsx | S |
| (modals)/event-day.tsx | D |
| (modals)/event-details.tsx | S |
| (modals)/event-success.tsx | S |
| (modals)/filters.tsx | S |
| (modals)/funds-held.tsx | D |
| (modals)/invitation.tsx | S |
| (modals)/message-thread.tsx | D |
| (modals)/notifications.tsx | S |
| (modals)/payment-failed.tsx | S |
| (modals)/payment-summary.tsx | D |
| (modals)/rate-staff.tsx | S |
| (modals)/staff-profile.tsx | S |
| (modals)/withdraw.tsx | D |
| (usher)/calendar.tsx | D |
| (usher)/home.tsx | D |
| (usher)/jobs.tsx | S |
| (usher)/messages.tsx | S |
| (usher)/profile.tsx | S |
| (usher)/wallet.tsx | D |
| (verification)/awaiting-approval.tsx | S |
| (verification)/id-verification.tsx | D |
| (verification)/kyc-consent.tsx | D |
| (verification)/profile-setup.tsx | D |
| (verification)/verification-rejected.tsx | S |
| +not-found.tsx | S |
| index.tsx | S |

Admin: Login, Dashboard, Verifications, Disputes, Approvals, Ledger, Users — all source reviewed. Only Login rendered (1440×900, 375×812); authenticated routes not exercised.

Native checks remain unverified: Dynamic Type, VoiceOver/TalkBack, reduced motion, keyboard overlap, performance, offline/slow networking, and round-trip mutation flows. Shared Text does not disable font scaling. Dependency motion defaults need device testing before asserting a reduced-motion failure.
