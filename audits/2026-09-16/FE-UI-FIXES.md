# HireQuick FE/UI fixes — 16 September 2026

Implemented the 23 audit recommendations in code, preserving the mobile app’s warm neutrals, emerald identity, and typography. The admin console now follows the same calm, trustworthy direction with responsive navigation and more deliberate review flows.

**Status: implementation complete; live/native acceptance remains incomplete.** This report is not a full UX-audit pass. Admin interaction checks used an isolated local fixture with synthetic records. No live account, identity decision, payment, message, or suspension was submitted. Native iOS/Android exports were built, but no device walkthrough was performed.

## Before / after

| Finding | Before | After |
|---|---|---|
| M01 — Contrast | Faint copy, status text, and inverse text on dark-mode fills fell below the small-text target. | Text/tint pairs meet 4.5:1 in both themes in automated checks. Filled brand and danger surfaces have separate tokens; primary/danger gradients stay legible. |
| M02 — Query failure states | Some failures looked like zero balance, no bank accounts, no jobs, empty search results, or an endless spinner. Event-day UI could say Live after a failed refresh. | Explicit retry states for cancellation, discovery, wallet, usher home, withdrawals, conversation lists/thread history, and attendance. Event-day freshness shows an update time or refresh failure. Saved withdrawal recovery still takes priority. |
| M03 — Bank lookup | Editing and restoring an account number could clear the resolved name without repeating the lookup. | Every bank/number revision owns its result; stale callbacks are ignored and the lookup can be retried. |
| M04 — Chat draft recovery | A failed older message overwrote the draft currently being typed. | Failed sends are kept separately with their own Retry action. The current composer stays intact, and pending text remains visible. |
| M05 — Selection accessibility | Chips and segmented controls omitted role/selection state. | Shared controls announce their purpose and selected state. |
| M06 — Field accessibility | Select/Stepper discarded the field label and error context. | Controls accept the visible label and helper/error hints; steppers announce which value changes and its current value. |
| M07 — Touch targets | Compact chips, segments, and buttons were below the project’s 44px target. | Shared targets are at least 44px; calendar dates have 48px height and month arrows 44px bounds. Device hit-testing remains outstanding. |
| M08 — Profile photo | Client onboarding displayed a photo action with no handler. | Clients see a noninteractive initials avatar; ushers use the working photo picker. |
| M09 — Attendance codes | The last generated code had no attached person or expiry. | The displayed code carries usher name, booking identity, and server-supplied expiry; expired/consumed codes stop displaying as active. |
| M10 — Payment wording | Checkout implied check-in alone released funds. | Reassurance describes attendance recording and booking completion; relevant welcome copy agrees. |
| M11 — Phone entry | Pasting a number with +234 could duplicate the country code. | Nigerian local, national, and international formats normalize to one E.164 number; malformed input is rejected. |
| M12 — Calendar | Wrapped fixed-width cells could drift away from seven weekday columns. | Explicit seven-cell week rows keep weekdays aligned, including leap years; the screen scrolls. Failed saves have feedback, and cancelled bookings no longer lock dates. |
| M13 — Earnings | Check-in described the gross booking fee as take-home earnings. | Check-in uses authoritative `payment.usherPayout` and release state. A ₦10,000 gross booking shows ₦8,500 after the platform fee. Booking-list gross values are identified as fees before commission. |
| M14 — Event budget | Estimated headcount × rate was labeled money held in escrow. | The label is “Estimated staffing budget,” without claiming funded status. |
| M15 — Verification | The instant route created a session but discarded it, then implied documents had arrived. | The unwired instant entry is removed; direct links lead to manual upload. The waiting screen requires actual document evidence for pending receipt copy and supports retry/empty states. Retention copy no longer promises immediate deletion. |
| A01 — Financial review | Money decisions were available directly from sparse table rows. | Dispute and approval panels show booking/event reference, parties, attendance, payment breakdown, supporting notes, rationale, and proposed outcome. Decisions remain behind existing server safeguards. Review panels receive focus and restore it on close. |
| A02 — Older records | Users and ledger were limited to the latest 100 rows. | Opt-in cursor pagination, user contact/role search, and booking filtering for the ledger. Newer/older navigation and honest empty states are available; legacy array API consumers remain supported. |
| A03 — Admin login | Seeded phone, unlabeled inputs, small controls, and no form/repair flow. | Empty labeled phone field, native form submission, telephone/OTP autocomplete, validation, pending feedback, resend, change-number, and 44px controls. |
| A04 — Row actions | Repeated clicks were possible; suspension applied immediately. | Pending locks, explicit account-change review, inline errors, and fresh-record recovery. Existing approval uncertainty fencing is preserved. |
| A05 — Admin responsiveness | A fixed sidebar consumed narrow screens. | Collapsible phone navigation, flexible headers, contained table scrolling, responsive review/evidence panels, skip link, and visible focus. |
| A06 — Admin states | Loading, failure, and empty queues were weakly distinguished. | Shared status/alert presentation, retry/reload actions, explicit empty worklists, and decision controls disabled during errors/loading. |
| A07 — Dashboard | Operational counts were inert. | Counts link to their relevant worklists; the approval threshold stays informational. |
| A08 — Identity evidence | Generic links opened documents separately and assumed URLs existed. | A comparison panel shows both documents, meaningful open links, missing/failed preview states, required rejection reasoning, and an inspection acknowledgement. Missing documents cannot be approved. |

## Validation

- **63 tests passed:** 36 UI-state/contrast/pagination tests, five new admin read-handler tests, and 22 existing admin-session/approval recovery tests. The new handler suite uses in-memory doubles and makes no database connection.
- **Typechecks passed:** API, admin, mobile.
- **Builds passed:** admin production build; Expo iOS and Android exports. Admin JS approximately 197.2 kB, 63.5 kB gzip; native exports approximately 5.37 MB each.
- **Changed-file lint passed with no warnings.** The ordinary mobile lint command encountered an existing shared/root `tsconfigRootDir` ambiguity. The changed files were then checked using the shared rules plus an explicit repository root and React Hooks rules; the root configuration was left untouched because it contains concurrent work.
- **Graph coverage:** checked 57 affected/evidence paths at generation `2026-09-16T10:32:44Z`, with no recorded gaps. This is best-effort metadata, not a completeness guarantee.
- **Browser interaction checks:** form submission with Enter; wrong-code recovery; mobile navigation open/close; dispute details and outcome selection; disabled decision before rationale; users page 50 → 11 older records; search returning one match and resetting pagination; account-change review/cancel; approval acknowledgement; review focus restoration; missing-document approval disabled.
- **Layout checks:** document width equals viewport width at tested 1440px, 375px, and 320px states. Wide tables scroll inside their container.
- **Browser diagnostics:** the clean verification tab had no runtime errors and retained the two pre-existing React Router future-flag warnings. A development hot-reload context error occurred during simultaneous file formatting in the earlier tab and disappeared after a full reload; it was not reproduced in the clean tab.

## Screenshots

All screenshots use synthetic local data, not a real operations account.

[Phone sign-in](evidence/fixed-admin-login-375.png) · [Desktop overview](evidence/fixed-admin-dashboard-1440.png) · [Missing identity evidence at 320px](evidence/fixed-verification-320.png)

## Remaining acceptance work

1. Run the changed mobile flows on iOS/Android with screen readers, large text, keyboard, slow/offline networking, and real image-picker permissions. Bundling and source tests do not establish native interaction quality.
2. Run the admin/API changes together against an approved staging environment. In particular, verify real cursor retrieval, signed document rendering, and actual role enforcement/end-to-end decision recovery. Unit handler tests assert the admin gate is wired but do not replace an authenticated integration test.
3. Deploy the API additions with the frontend: the new admin uses paged envelopes and the booking-review endpoint; the mobile code expiry display needs the new `expiresAt` response.
4. Complete the full interaction manifest, assistive-technology checks, accessibility scan, and performance measurements before upgrading the original audit verdict.

No deployment or commit was made. Concurrent documentation, payments, environment, and lint-configuration edits were preserved.
