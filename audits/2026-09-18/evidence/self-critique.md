# Independent skeptical review — shared and usher flows

18 September 2026. Reviewed `shared-flow-review.md` and `usher-flow-review.md`, then checked the strongest claims against current source. No application edits or device/live-provider actions. Current graph ready; exact-path coverage for 16 checked evidence files matched generation `2026-09-18T18:33:06Z`, no recorded gaps. This is bounded corroboration rather than an exhaustive repeat of either audit.

## Keep

- **U01 self-arrival, U02 WITHDRAWN rendering, U03 accepted-vs-funded label, U04 booking history, U05 role-specific cancellation, U06 dispute journey and U08 withdrawal tracking** have concrete source-supported consequences. U02 really dereferences `b.label` without a WITHDRAWN entry (`jobs.tsx:27–32,121–123`); invitation decline really writes WITHDRAWN (`recruitment.ts:99–101`). Retain the existing qualification: render failure inferred from source, not a reproduced native crash.
- **SHR-06 notification navigation, SHR-08 retained chat discoverability, SHR-09 inactive-account handling** are supported. Notification navigation handles only checkout/invitation/event (`notifications.tsx:82–91`). Conversation filtering excludes cancelled/refunded/no-show (`ConversationList.tsx:19,28`). Auth restore discards error identity into the generic restore state (`auth-session.ts:75–79`).
- **U10 pending verification** accurately says no explicit refresh/poll. It must not become “verification never updates”: query remount/refetch behavior may still refresh it. The report already preserves that distinction.
- Both reports appropriately distinguish unsupported backend settlement/post-payout disputes from missing UI. Keep that separation.

## Correct exact references and implementation scope

1. **SHR-07 source anchor is wrong:** `hooks.ts:173` is `useGenerateCheckin`, not text sending. Cite [hooks.ts:163](/Users/leslieisah/app-dev/hire-quick/apps/mobile/lib/hooks.ts:163), or line 166 for the string-only mutation.
2. **SHR-05 requirement section is wrong:** the broader notification catalogue is **PRD §10**, at [PRD:193](/Users/leslieisah/app-dev/hire-quick/documentation/02-HireQuick-PRD.md:193), not §11 (Reviews & Ratings).
3. **SHR-04 push-open routing also needs backend payload work:** current [brevo.ts:191](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/notifications/brevo.ts:191) sends notification title/body without typed target data. `deliver` receives only user/title/body, although persisted inbox notifications carry target IDs separately ([notifications/service.ts:18](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/notifications/service.ts:18), [notifications/service.ts:47](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/notifications/service.ts:47)). Do not scope this as a mobile-only SDK/token fix. FCM transport is implemented; retain the report’s warning against calling it a stub.
4. **U13 QR requires client presentation and native scanner, not necessarily a new verification endpoint.** QR can carry the same booking-bound code and use the existing server verification. The report’s acceptance already permits this; preserve it during synthesis.
5. Do not carry the phrase “latest 25 ledger entries” over as “25 withdrawals”: wallet activity caps ledger entries at 25, including credits/debits; held entries are separately capped at 25. The withdrawal-history gap is real, but the numeric bound has a specific meaning ([payments/http/routes.ts:105](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/payments/http/routes.ts:105)).

## Severity calibration

- Recommend **U07 P1 → P2**. Missing client-rating UI is a genuine explicit requirement, but it does not block attendance, release, refund or access to held money. Raising it to the same urgency as self-arrival protection dilutes the launch priorities unless two-way reputation is explicitly a release gate.
- Recommend **U13 P2 → P3 / scope decision**. OTP is the specified primary path and works in source; QR is secondary. Keep it visible as specification drift or an explicit defer decision, not a critical attendance failure.
- **SHR-05 broad catalogue** should not receive one blanket P1 for all missing events. Keep verification/cancellation/dispute-outcome delivery high priority; shortlist/review reminders can be P2. The absence of matching-usher event broadcasts is also a false-success-copy finding, not proof that every event needs a broadcast feature.
- Do not downgrade U08 simply because provider recovery is implemented. Its claim is about the user’s inability to inspect an authoritative later outcome after acknowledging a pending receipt, which the source supports.

## Merge presentation, preserve distinct fixes

- Group **SHR-04/05/06** under one Notifications workstream with three distinct dependencies: enable delivery, cover lifecycle events, route to records. They are related but not duplicates; avoid counting three missing screens.
- Group **U04, SHR-08 and notification destinations in SHR-06** around the shared booking/case detail/history foundation. Keep archived chat and notification routing as separate acceptance cases.
- Group **U06 and ADM-04** as one end-to-end dispute evidence flow: participant submission → counterpart response → operator inspection → resolution tracking. A new admin evidence tab alone cannot complete it.
- **U12 invitation withdrawal and U05 cancellation are not duplicates.** The first concerns accepted but unfunded recruitment; funded commitments require cancellation. Preserve that state distinction.
- Keep ordinary-application withdrawal explicitly labelled a product-completeness recommendation, not a missing cited launch requirement.

No outright false positive was found among the strongest checked claims. The main corrections are severity calibration, two exact references, shared-foundation deduplication and one backend dependency omitted from the notification scope. Do not imply native execution or background-delivery verification from these source checks.
