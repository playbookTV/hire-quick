# HireQuick frontend and UI design audit

Date: 16 September 2026 · Source baseline: `775d928` · Direction: **calm and trustworthy**

**Live UX verdict: INCOMPLETE.** This is a broad source audit with limited rendered admin evidence, not a completed end-to-end usability certification. The findings below are actionable, but native device testing and authenticated admin interaction remain outstanding.

**23 findings: 0 P0, 10 P1, 12 P2, 1 P3.** P1 means fix before release; P2 means the next usability pass; P3 is polish. No application code was changed.

## Top five

1. **M15 — Instant verification skips identity capture.** Remove the misleading entry point first: it can send a new usher into a waiting state without completing the promised submission.
2. **M13 — Check-in overstates wallet earnings.** A ₦10,000 gross booking is presented as ₦10,000 earned even though the wallet receives ₦8,500; this directly breaks payment trust.
3. **M14 — Estimated budget is described as funds held.** A small presentation change can stop an unfunded event from falsely appearing financially secured.
4. **M12 — Calendar columns can disagree with weekdays.** The layout can lead an usher to set availability against the wrong weekday, undermining a core scheduling task.
5. **M01 — Shared colors fail text contrast.** Correcting the semantic tokens improves readability across many screens and both themes at once.

M02–M04 and A01–A02 also warrant pre-release work. The ordering above balances user impact, confidence, and the size of the first useful correction.

## Scope and evidence

Personas used:

- **Client:** a Lagos event organizer assembling a multi-person crew and checking arrivals under time pressure, primarily on a phone.
- **Usher:** a freelancer checking availability, attendance, earnings, and bank withdrawal status, including on an unreliable connection.
- **Administrator:** an operations/support reviewer making identity and financial decisions across queues.

The documented product roles and trust-first principles come from [UXRD §§2–5, 12–13](/Users/leslieisah/app-dev/hire-quick/documentation/03-HireQuick-UXRD.md). Time pressure and unreliable connectivity are explicit audit scenarios, not claimed user-research results. The user confirmed “calm and trustworthy.” The reusable context is recorded in [.impeccable.md](/Users/leslieisah/app-dev/hire-quick/.impeccable.md).

| Area | Coverage achieved | Limit |
|---|---|---|
| Mobile | 51 route files inventoried: 7 layouts and 44 non-layout routes, including redirect and not-found. Shared components, tokens, hooks, and key workflows inspected; 22 routes deep-reviewed and 22 broadly source-screened. | 0 native routes interaction-tested. No device screenshots, screen-reader session, Dynamic Type test, or measured frame rate. |
| Admin | All 7 page components and shared layout/UI/auth/data-loading code reviewed. | Login inspected at 1440×900 and 375×812. Six authenticated pages remain source-only. |
| Runtime | Admin preview started; login screenshots, DOM dimensions, and console inspected. | The seeded-account sign-in was rejected by automatic approval review pending explicit authorization. No authenticated actions performed. |
| Mobile preview | Expo web startup attempted. | Missing `react-native-web`; no available native runtime established. The package/lockfile was not modified to manufacture a web target. |
| Automated design scan | Impeccable 4.1.0 returned zero findings for both source trees; a positive control triggered expected findings. | Static detector coverage is limited, particularly for React Native style objects and runtime semantics. No browser overlay or axe run. |
| Build checks | Both frontend typechecks passed. Admin production build passed. | Mobile native build, device performance, and end-to-end tests not run. |

The graph was used before structural discovery. Initial generation was `2026-09-16T09:34:24Z`; it refreshed to `2026-09-16T09:37:39Z` in full mode. Relevant graph pagination and cited-path coverage checks were completed. `dispute.tsx:68` was the recorded mobile parse gap and was read directly. Clean coverage means no recorded gap, not proof that every behavior is correct.

**Interaction manifest:** incomplete. One login surface visually inspected; zero completed primary-action/detail round trips. No invented click or timing evidence is used. Screenshots: two login viewports, not before/after a successful submission. Console: zero errors and two React Router future-flag warnings at the observed initial login load. Network status inventory, axe Critical/Serious counts, LCP, CLS, and INP are **not measured**, not zero. Browser evaluation exposed a read-only DOM scope without the Performance API. The complete 11-scenario battery, data-volume/age stress tests, offline behavior, and role switching remain unrun. Consequently no release-ready live verdict is possible under the [UX audit skill](/Users/leslieisah/app-dev/hire-quick/.agents/skills/ux-audit/SKILL.md), which states: “If the work doesn't include a complete Interaction Manifest, the only legal verdict is **Incomplete**.”

Self-critique: **23 drafted, 23 kept, 0 generic, 0 duplicates**. An independent reviewer narrowed untested claims, downgraded M05/A03/A04 to P2 and A07 to P3, and removed overlapping stale-action wording from A06.

## Overall design assessment

The mobile app has a usable design foundation: warm neutral surfaces, emerald emphasis, restrained gold, shared typography, semantic themes, and clear primary actions. Preserve that direction. Its largest weakness is that reassuring presentation sometimes outruns what the app actually knows: estimated money becomes “held,” gross value becomes “earned,” failed data becomes zero, and an unfinished verification route becomes “submitted.” A calm product must be accurate before it is soothing.

The admin console is visually generic in the inspected login and structurally utilitarian in source. A centered white card, system typography, slate colors, and uniformly styled tables provide little HireQuick identity. That is a **visual distinction concern**, not evidence that AI generated it. More consequentially, its financial and identity workflows ask reviewers to act with too little context. Start with decision quality rather than decorative redesign.

**Anti-pattern verdict:** admin visual distinctiveness needs work; mobile visual verdict is withheld pending native screenshots. Repeated cards, a balance hero, or a familiar font are not automatically defects when they serve the task. The deterministic scan reported zero findings; it did not invalidate the manual accessibility and behavior findings.

### Provisional source-based technical scores

These scores apply the audit skill's 0–4 rubric to inspected implementation evidence. They are not measured accessibility conformance or runtime performance scores.

| Dimension | Mobile | Admin | Main evidence |
|---|---:|---:|---|
| Accessibility | 2 | 1 | Semantic effort exists, but text contrast and custom-control information have gaps; admin login relies on placeholders. |
| Performance implementation | 3 | 3 | Mobile FlashList/debounced search; admin production JavaScript is 185.12 kB, 60.01 kB gzip. Neither is profiled on a real user device. |
| Responsive implementation | 1 | 1 | Calendar has incorrect column arithmetic; admin shell has no narrow-layout alternative. |
| Theming | 2 | 1 | Mobile semantic light/dark maps need contrast repair; admin is light-only with literal utility colors. Dark mode is not assumed to be an admin requirement. |
| Anti-patterns | 3 | 2 | Mobile has a coherent token foundation; admin login is a generic utility surface. Native visual judgment remains provisional. |
| **Total** | **11/20** | **8/20** | Significant mobile work; substantial admin usability work. |

Admin build evidence: 45 modules, CSS 11.94 kB / 3.13 kB gzip, JavaScript 185.12 kB / 60.01 kB gzip. Build duration is not a user performance metric. No claim about LCP, INP, bundle adequacy on low-end phones, or native animation smoothness is made.

### Provisional Nielsen heuristic scores

| Heuristic | Mobile /4 | Admin /4 | Main weakness |
|---|---:|---:|---|
| Visibility of system status | 1 | 2 | False money/submission states; limited row-level pending feedback. |
| Match with the real world | 2 | 2 | Earnings and held-funds terminology; raw operation kinds. |
| User control and freedom | 3 | 2 | Mobile back/review flows exist; admin OTP recovery is thin. |
| Consistency and standards | 3 | 2 | Shared mobile primitives; admin behavior varies by queue. |
| Error prevention | 1 | 1 | Calendar and bank-resolution defects; financial decisions lack review context. |
| Recognition over recall | 2 | 1 | Event-day code ownership and separated verification documents. |
| Flexibility and efficiency | 2 | 1 | Useful mobile filters; older admin records lack navigation. |
| Aesthetic and minimalist design | 3 | 2 | Coherent mobile source patterns; sparse admin without task hierarchy. |
| Error recovery | 1 | 1 | False empty states, stranded resolver, lost chat draft, no admin retry. |
| Help and documentation | 2 | 1 | Some mobile contextual reassurance, but inconsistent lifecycle copy. |
| **Total** | **20/40** | **15/40** | Source-informed triage scores, not completed persona walkthrough scores. |

Cognitive-load screen: event creation has a long details step, but progressive steps and review help. Event-day code display fails the memory/context check. Verification review separates the documents from each other and the decision. A global eight-item pass/fail count is withheld because those screens were not rendered. Five mobile navigation destinations are part of the product spec and are not flagged merely for exceeding an arbitrary option count.

## P1 — fix before release

### M15 — Instant verification skips capture but shows submission success

**Layer/category:** Interaction / Feedback. **Persona/surface:** new usher, `/(verification)/id-verification` → `kyc-consent` → `awaiting-approval`; viewport-independent source flow.

**Source-traced reproduction:** 1. Choose “Verify with NIN/BVN.” 2. Consent and start verification. 3. Let session creation succeed. The success callback discards the session and navigates to the waiting page without launching the capture widget.

**Observed in source:** `void session` and immediate routing; the destination unconditionally marks “Submitted — Documents received.” The manual upload path remains available, so this is P1 rather than a claim that all onboarding is blocked.

**Expected/impact:** show a received state only after actual submission. An usher can otherwise wait for approval without completing the promised verification.

**Evidence:** [kyc-consent.tsx:38](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(verification)/kyc-consent.tsx:38>), [awaiting-approval.tsx:74](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(verification)/awaiting-approval.tsx:74>), [id-verification.tsx:104](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(verification)/id-verification.tsx:104>). Not live-reproduced.

**Smallest possible patch:** gate the instant-verification entry until the native widget is integrated; retain manual upload. Derive receipt/review steps from actual submission state. **Command:** `/harden`.

### M13 — Check-in promises gross booking value as wallet earnings

**Layer/category:** Feedback / money presentation. **Persona/surface:** usher, `/(modals)/check-in`; all widths.

**Source-traced reproduction:** 1. Use a confirmed booking with ₦10,000 gross value. 2. Open check-in, then its checked-in or paid state. 3. Compare the displayed personal pay with the wallet credit.

**Observed in source:** `money(booking.amount)` supplies “YOUR PAY,” “EARNED,” and the amount said to reach the wallet. Booking creation sets that field to the gross per-head budget; the API returns it unchanged. The ledger credits `payment.usherPayout` after the 15% fee, yielding ₦8,500 in this example.

**Expected/impact:** personal earnings must use the net payout. The current screen creates a concrete ₦1,500 discrepancy in the user's expectation; this is a frontend presentation defect, not a claim that the ledger pays incorrectly.

**Evidence:** [check-in.tsx:69](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/check-in.tsx:69>), [check-in.tsx:123](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/check-in.tsx:123>), [booking creation:126](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/service.ts:126), [fee allocation:221](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/payments/ledger/ledger.ts:221), [wallet credit:326](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/payments/ledger/ledger.ts:326). Full data path inspected; not live-reproduced.

**Smallest possible patch:** expose the already-returned payment payout in the mobile booking type and use authoritative `payment.usherPayout` for earned/released amounts. Keep gross, fee, and net explicit where needed; use shared integer-money helpers for estimates. **Command:** `/harden`, then `/clarify`.

### M14 — Estimated staffing budget is labeled as money already held

**Layer/category:** Feedback / money status. **Persona/surface:** client, `/(client)/events/[id]`; all widths.

**Source-traced reproduction:** 1. Open an event before any payment. 2. Read the staffing summary. Its full headcount × budget is labeled “Total held safely.” The same calculation remains for partial funding or after release.

**Expected/impact:** a budget is an estimate; held funds require payment/escrow evidence. The label can make a client believe staff are financially secured before checkout.

**Evidence:** [events/[id].tsx:90](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(client)/events/[id].tsx:90>), [events/[id].tsx:145](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(client)/events/[id].tsx:145>). Source-confirmed; no claim about actual escrow corruption.

**Smallest possible patch:** rename this computed row “Estimated staffing budget.” Render a separate held-funds row only from authoritative payment data, accounting for partial funding/refunds/releases. **Command:** `/clarify` and `/harden`.

### M12 — Calendar dates can wrap into six or eight columns

**Layer/category:** Visual / responsive layout. **Persona/surface:** usher availability calendar; source arithmetic at 320px and 390px widths.

**Source-traced reproduction:** 1. Render the calendar at 390px width. 2. Account for 20px padding on each side. 3. The 350px interior fits eight 40px cells with seven 4px gaps, while headings remain seven columns. At 320px, the 280px interior fits only six cells.

**Expected/impact:** every week must always occupy exactly seven aligned columns. Misaligned weekdays can cause the usher to choose availability using the wrong day association. This is deterministic layout evidence, not an observed native screenshot.

**Evidence:** [calendar.tsx:117](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(usher)/calendar.tsx:117>), [calendar.tsx:148](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(usher)/calendar.tsx:148>), [calendar.tsx:159](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(usher)/calendar.tsx:159>).

**Smallest possible patch:** build explicit seven-cell week rows with shared equal-width sizing for headers and dates. Verify narrow screens and large text on native devices. **Command:** `/adapt`.

### M01 — Shared text colors fall below the contrast requirement

**Layer/category:** Visual / accessibility / theming. **Persona/surface:** all mobile users, status pills, banners, hints, earnings cards; light and dark themes.

**Source-based check:** inspect the semantic token foreground/background pairs used for small text, then calculate sRGB relative-luminance contrast. These are opaque token calculations, not pixel samples.

| Foreground / background | Hex pair | Ratio |
|---|---|---:|
| Light faint / canvas | `#B4AC9E` / `#FBF7F0` | 2.11:1 |
| Light faint / surface | `#B4AC9E` / `#FFFFFF` | 2.25:1 |
| Dark faint / canvas | `#5C564C` / `#14130E` | 2.56:1 |
| Warning / warning tint | `#D97706` / `#FBEBD2` | 2.72:1 |
| Success / success tint | `#1E8E5A` / `#DDF0E5` | 3.48:1 |
| Gold status / gold tint | `#C68A1E` / `#F8ECCF` | 2.54:1 |
| Inverse / dark-theme emerald | `#FBF7F0` / `#18A074` | 3.11:1 |

**Expected/impact:** small informative text needs 4.5:1 contrast under the project's AA baseline; color-only decoration is not being assessed as text. Faint money/status labels undermine readability, particularly outdoors. [W3C contrast guidance](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html).

**Evidence:** [semantic.ts:25](/Users/leslieisah/app-dev/hire-quick/apps/mobile/theme/semantic.ts:25), [semantic.ts:40](/Users/leslieisah/app-dev/hire-quick/apps/mobile/theme/semantic.ts:40), [EarningsCard.tsx:30](/Users/leslieisah/app-dev/hire-quick/apps/mobile/components/EarningsCard.tsx:30), [Banner.tsx:17](/Users/leslieisah/app-dev/hire-quick/apps/mobile/components/Banner.tsx:17), [StatusPill.tsx:19](/Users/leslieisah/app-dev/hire-quick/apps/mobile/components/StatusPill.tsx:19).

**Smallest possible patch:** create text-safe status colors separately from accent/icon colors; increase faint-text contrast; give brand-filled surfaces dedicated foreground tokens in each theme. Validate actual small-text uses, not every primitive swatch. **Command:** `/colorize`, then `/audit`.

### M02 — Failed requests appear as zero, empty, current, or indefinitely loading

**Layer/category:** Feedback / error recovery. **Persona/surface:** client discovery/cancellation; usher home/withdrawal; client event-day.

**Source-traced reproduction:** make each relevant query fail after retries, then follow its render branches. Cancellation stays in `isLoading || !data`; discovery shows no matching ushers; usher home defaults missing wallet data to zero and bookings to empty; withdrawal can show ₦0 or first-account setup on query failure. Event-day's “Live” wording is derived from fetching state rather than a successful recent response.

**Expected/impact:** distinguish successful empty data, unavailable data, and stale last-known data. Users must not infer lost earnings, absent staff, or current attendance from failed requests.

**Evidence:** [cancellation.tsx:44](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/cancellation.tsx:44>), [discover.tsx:181](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(client)/discover.tsx:181>), [usher/home.tsx:173](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(usher)/home.tsx:173>), [withdraw.tsx:55](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/withdraw.tsx:55>), [event-day.tsx:161](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/event-day.tsx:161>). Network fault injection not performed.

**Smallest possible patch:** add explicit loading/error/empty/success states and Retry, retaining last-known values with a stale marker and last-successful-update time where appropriate. Prioritize money and attendance. **Command:** `/harden`.

### M03 — Correcting a bank-account number can strand a valid lookup

**Layer/category:** Interaction / form state. **Persona/surface:** usher, `/(modals)/withdraw`, adding a bank account.

**Source-traced reproduction:** 1. Resolve a valid bank + 10-digit account. 2. Delete its final digit. 3. Type that digit again. The effect clears `resolvedName`, then skips the lookup because the restored key equals `lastResolved.current`. Adding the account requires a resolved name. An unsuccessful lookup also lacks an unchanged-input retry.

**Expected/impact:** correcting or retrying valid details must recover. Users can otherwise be stuck before their first withdrawal.

**Evidence:** [withdraw.tsx:109](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/withdraw.tsx:109>), [withdraw.tsx:132](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/withdraw.tsx:132>). Source trace, not a submitted bank request.

**Smallest possible patch:** cache successful names by account key or invalidate the key on incomplete input; provide Retry; fence both success and failure responses against the current input generation. **Command:** `/harden`.

### M04 — A failed chat send can replace the next draft

**Layer/category:** Interaction / error recovery. **Persona/surface:** client or usher, `/(modals)/message-thread`.

**Source-traced reproduction:** 1. Send draft A on a slow connection. 2. Type draft B while A is pending. 3. Let A fail. The error callback restores A into the still-editable composer without checking whether B exists.

**Expected/impact:** failed delivery must not destroy newly composed text. The failure also needs visible explanation rather than an unexplained reappearing draft.

**Evidence:** [message-thread.tsx:42](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/message-thread.tsx:42>). No messages sent during this audit.

**Smallest possible patch:** represent pending/failed messages separately with Retry; restore text only if the composer has remained untouched. Distinguish history-fetch failures from “No messages yet.” **Command:** `/harden`.

### A01 — Financial decisions lack enough review context

**Layer/category:** Architecture / decision design. **Persona/surface:** admin `/disputes` and `/approvals`; source-only, desktop intended.

**Source-traced reproduction:** open either worklist. Disputes offer Pay usher / Refund client from an event/reason/amount/status row, with a generic note prompt. Approval rows show only kind, amount, requester, and immediate decision buttons; no event/booking identity, supporting evidence, or contextual outcome review is rendered.

**Expected/impact:** a reviewer must understand which case, parties, rationale, and financial outcome they are approving. This concerns frontend decision quality; server maker-checker safeguards are not being claimed absent.

**Evidence:** [Disputes.tsx:15](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/pages/Disputes.tsx:15), [Disputes.tsx:33](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/pages/Disputes.tsx:33), [Approvals.tsx:46](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/pages/Approvals.tsx:46).

**Smallest possible patch:** introduce a review detail view containing case/event/booking reference, parties, amount, reason, evidence links, and explicit outcome before the existing submit action. Add API detail fields only where necessary. **Command:** `/shape`, then `/harden`.

### A02 — Older users and ledger entries cannot be reached through these screens

**Layer/category:** Architecture / information access. **Persona/surface:** admin `/users` and `/ledger` with more than 100 records.

**Source-traced reproduction:** inspect the request and render paths after more than 100 records exist. Users requests the latest 100 with no search field or pagination; ledger requests `limit=100`, also without paging or filtering. The backend supports a user query but the UI does not expose it.

**Expected/impact:** operations must find an older user or transaction to investigate an issue. These records become inaccessible through the corresponding console screens, though they remain in the system.

**Evidence:** [Users.tsx:14](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/pages/Users.tsx:14), [Ledger.tsx:15](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/pages/Ledger.tsx:15), [admin routes:179](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/admin/routes.ts:179), [admin routes:195](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/admin/routes.ts:195). No high-volume data seeded.

**Smallest possible patch:** expose user search and cursor pagination; add ledger date/booking filters and pagination to the API and view, with result range and empty-filter state. **Command:** `/shape`.

## P2 — next usability pass

Each reproduction below is a source-derived test scenario unless marked rendered. Perform it during the follow-up runtime audit; it is not an invented interaction record.

| ID · layer | Surface / persona | Reproduction and observed source evidence | Expected behavior and smallest possible patch |
|---|---|---|---|
| **M05 · Accessibility** | Discovery filters, profile language chips, job segments / mobile users | Select a Chip or Segmented option with assistive technology. Visual selection changes, but roles and selected/checked state are not supplied. [Chip:18](/Users/leslieisah/app-dev/hire-quick/apps/mobile/components/Chip.tsx:18), [Segmented:21](/Users/leslieisah/app-dev/hire-quick/apps/mobile/components/Segmented.tsx:21). No claim that selection is completely impossible. | Expose the correct role, label, and selected/checked state on the actual control. `/harden` → `/audit`. |
| **M06 · Accessibility** | Labeled selects and steppers / mobile form users | Focus a Field-wrapped Select or Stepper. Field clones its label/error metadata, but custom controls discard it; Select still has a title hint and is not wholly unnamed. [Field:21](/Users/leslieisah/app-dev/hire-quick/apps/mobile/components/Field.tsx:21), [Select:25](/Users/leslieisah/app-dev/hire-quick/apps/mobile/components/Select.tsx:25), [Stepper:28](/Users/leslieisah/app-dev/hire-quick/apps/mobile/components/Stepper.tsx:28). | Forward typed label/error/value props; announce the field context, value, and increase/decrease action. `/harden`. |
| **M07 · Responsive** | Chips, job segments, compact buttons / one-handed mobile use | Source dimensions: chips 32/35px high, segmented controls about 34px, medium ghost/bordered buttons 40/42px. These undershoot the project baseline. [Chip:18](/Users/leslieisah/app-dev/hire-quick/apps/mobile/components/Chip.tsx:18), [Segmented:21](/Users/leslieisah/app-dev/hire-quick/apps/mobile/components/Segmented.tsx:21), [Button:57](/Users/leslieisah/app-dev/hire-quick/apps/mobile/components/Button.tsx:57). | Establish at least 44px tappable bounds centrally, retaining compact visuals if useful. Verify hit areas and spacing on device. `/adapt`. |
| **M08 · Interaction** | `/(auth)/complete-profile` / new client | Tap the avatar Add a photo action. This instance supplies no callback and AddPhoto does not launch a picker itself. [complete-profile:83](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(auth)/complete-profile.tsx:83>). | Use the existing AvatarPicker or clearly defer photo setup. `/harden`. |
| **M09 · Recognition** | `/(modals)/event-day` / client managing several arrivals | Generate codes for two different roster members. The shared displayed state retains only the latest code, without its usher identity or expiry. [event-day:36](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/event-day.tsx:36>), [event-day:119](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/event-day.tsx:119>). | Store and display booking/person/code/expiry together, preferably in the relevant roster row. `/layout` + `/clarify`. |
| **M10 · Copy** | `/(modals)/payment-summary` and completion / client | Read checkout reassurance, then event completion. Checkout says release occurs “only when they check in”; other screens describe completion/release. The UXRD also contains conflicting older and newer wording. [payment-summary:174](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/payment-summary.tsx:174>). | Agree one lifecycle sentence against the current policy, then reuse it: e.g. held until attendance is recorded and the booking is completed. This is copy inconsistency, not evidence of a payment-engine defect. `/clarify`. |
| **M11 · Input** | `/(auth)/phone` / returning Nigerian user | Paste or receive autofill containing an already international `+234…` number. Normalization strips symbols then always prepends `+234`, duplicating the prefix. Not every autofill provider supplies this format. [phone:29](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(auth)/phone.tsx:29>). | Normalize supported local and international formats before validation; show a field-level message for unsupported formats. `/harden`. |
| **A03 · Form usability** | Admin login / admin, rendered at 1440×900 and 375×812 | Inputs have placeholders but no persistent labels; no form submission handler exists in source. Once `sent` is true, no explicit resend/change-number step is rendered and the phone remains editable. DOM measured input 38px, CTA 36px. [Login:43](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/pages/Login.tsx:43). Enter submission was **not** tested. | Add labeled form controls, phone/OTP semantics, Enter submission, validation, resend cooldown, and explicit change-number reset; enlarge touch bounds. `/harden` + `/adapt`. |
| **A04 · Feedback** | Admin Users, Verifications, Disputes / ops reviewer | Start a row mutation on a slow connection. Handlers lack row pending state; buttons remain available through mutation/refresh. Suspension is immediate from the list. [Users:16](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/pages/Users.tsx:16), [Verifications:18](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/pages/Verifications.tsx:18), [Disputes:15](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/pages/Disputes.tsx:15). Duplicate server effects are **not** asserted. | Add per-row pending feedback and repeat-submission guards through confirmed refresh; include contextual review for suspension. Preserve Approvals' existing pending protection. `/harden`. |
| **A05 · Responsive risk** | Authenticated admin shell / narrow viewport | Source shell uses fixed `w-56` sidebar and main `p-8` without a narrow-layout alternative. This leaves competing content widths; actual collapse has not been observed. [Layout:17](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/components/Layout.tsx:17), [Layout:42](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/components/Layout.tsx:42). | Add a narrow-screen topbar/drawer, smaller main gutters, and `min-width:0`; keep table scrolling local. Verify 375/768/1024/1440px before claiming responsive completion. `/adapt`. |
| **A06 · Recovery** | Admin data pages, especially Users/Ledger / ops reviewer | Fail an initial load, or return a successful empty array. Shared State renders error text without Retry/status announcements; Users and Ledger produce header-only empty tables. [ui:66](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/components/ui.tsx:66), [Users:29](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/pages/Users.tsx:29), [Ledger:19](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/pages/Ledger.tsx:19). | Give State an onRetry callback and appropriate live status; add explicit empty-table messages. Keep stale-action handling under A04. `/harden` + `/clarify`. |
| **A08 · Review context** | Admin `/verifications` / identity reviewer | Compare a person's ID and selfie: both links read “view” and open separate tabs, separating evidence from decision context. API URLs can be null without a dedicated missing-document state in this page. [Verifications:36](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/pages/Verifications.tsx:36). No private documents opened. | Provide a named review detail with side-by-side evidence, person identity, zoom/open-original options, descriptive links, and missing-document state. `/shape` + `/layout`. |

For M07/A03, **44×44 is HireQuick's own UXRD requirement**. Do not describe it as a universal WCAG 2.1 AA requirement; WCAG 2.1's 44px target-size criterion is AAA. [W3C target-size guidance](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html). Persistent labels are assessed against the form's need for clear instructions, with programmatic naming checked separately. [W3C labels guidance](https://www.w3.org/WAI/WCAG21/Understanding/labels-or-instructions.html).

## P3 — polish

**A07 — Dashboard counts do not open the relevant worklists.** Admin `/`, source-only. Open the dashboard and choose a pending verification/dispute count: each is a noninteractive `div`; navigation requires returning to the sidebar. [Dashboard.tsx:27](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/pages/Dashboard.tsx:27). The smallest patch is to link actionable counters to their queues and separate the policy threshold from work awaiting attention. This is an efficiency improvement, not a claim of an observed visual hierarchy failure. `/layout`, then `/polish`.

## Strengths to preserve

- **Mobile semantic foundations:** real light/dark token maps and shared components make systemic repair feasible. [semantic.ts](/Users/leslieisah/app-dev/hire-quick/apps/mobile/theme/semantic.ts).
- **Checkout detail and recovery:** event/staff/total context and the non-additive platform-fee explanation are present; saved checkout/withdrawal recovery and a withdrawal review step show care around uncertain financial outcomes. [payment-summary.tsx](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/payment-summary.tsx>), [withdraw.tsx](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/withdraw.tsx>).
- **Reusable accessible behavior already exists:** main buttons expose disabled/busy state; phone OTP includes autofill/resend support; several screens implement genuine error/retry branches. Extend these patterns instead of introducing a parallel component system. [Button.tsx](/Users/leslieisah/app-dev/hire-quick/apps/mobile/components/Button.tsx), [otp.tsx](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(auth)/otp.tsx>).
- **Purposeful structure:** stepped event creation, review before checkout, cancellation outcome explanation, and release confirmation suit a trust-first service. [create-event.tsx](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/create-event.tsx>), [cancellation.tsx](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/cancellation.tsx>).
- **Some performance discipline:** discovery uses FlashList, memoized rows, and debounced search. This is implementation evidence, not measured smoothness. [discover.tsx](</Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(client)/discover.tsx>).
- **Admin semantics and safeguards:** real headings, links, buttons, and tables; an explicit unavailable-session recovery state; and approval actions that protect pending/uncertain decisions. [ui.tsx](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/components/ui.tsx), [auth.tsx](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/lib/auth.tsx), [Approvals.tsx](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/pages/Approvals.tsx).

## Remediation sequence

### Quick wins — first 24–48 hours of focused work

1. `/harden` — gate the unwired KYC entry; correct gross/net display and bank resolver state; protect chat drafts; restore truthful data-loading states (M15, M13, M03, M04, M02).
2. `/clarify` — rename the estimated budget and unify completion/release language (M14, M10).
3. `/adapt` — enforce seven calendar columns, then shared touch targets (M12, M07).
4. `/colorize` — repair semantic text contrast in both themes; keep the current palette character (M01).
5. `/harden` — fix shared accessibility propagation, dead photo action, telephone normalization, and admin auth/retry/pending behavior (M05–M08, M11, A03–A04, A06).

The time grouping is a planning estimate, not a delivery commitment; integration and native verification can extend it.

### Structural work — approximately one to two weeks

- `/shape` — design case review for disputes/approvals and evidence comparison for verifications (A01, A08), then implement it with existing authorization boundaries.
- `/shape` — complete record retrieval with search, filters, and pagination (A02).
- `/adapt` — give the admin shell a narrow-screen navigation pattern (A05).
- `/layout` — keep event-day codes beside their people and connect dashboard counts to worklists (M09, A07).

### Advanced polish — after truthful states and access are verified

- Apply restrained spacing, typography, focus, and status hierarchy improvements in the admin so it feels related to the mobile product without reducing information density.
- Add purposeful motion only after native reduced-motion behavior and device responsiveness have been verified.
- Re-run `/audit` and the live workflow checks after fixes; finish with **`/polish`**.

These commands can be run one at a time, together, or in any preferred order. No fixes were applied during this audit.

## Required verification to close the audit

1. Authorize seeded-account sign-in for the configured API, then inspect all six authenticated admin routes using read-only interactions. Any payment, moderation, or identity decision should use disposable test data with explicit authorization.
2. Run the actual mobile app on iOS and Android. Check light/dark themes, 320/375/390px-equivalent widths, keyboard appearance, large text, screen-reader navigation, and reduced motion.
3. Reproduce each source-traced P1 scenario; capture before/after screenshots, console/network evidence, and round-trip state. Exercise client and usher roles.
4. Run axe on rendered web pages and measure LCP/CLS/INP on an authenticated representative route; use native profiling for the mobile app rather than treating web metrics as native evidence.
5. Complete interrupted-flow, wrong-turn, empty/heavy/aged-data, slow/offline, permission, and round-trip tests. Record real timestamps and coverage; do not convert untested cases into passes.

The [UX audit skill](/Users/leslieisah/app-dev/hire-quick/.agents/skills/ux-audit/SKILL.md) requires proof of interaction. Its incomplete verdict is preserved here rather than substituted with a source-only “Pass.”

## Evidence artifacts

- [Route inventory and native test limits](/Users/leslieisah/app-dev/hire-quick/audits/2026-09-16/evidence/route-inventory.md)

- [Admin login — desktop](/Users/leslieisah/app-dev/hire-quick/audits/2026-09-16/evidence/admin-login-1440.png)
- [Admin login — phone width](/Users/leslieisah/app-dev/hire-quick/audits/2026-09-16/evidence/admin-login-375.png)
- [Observed admin console](/Users/leslieisah/app-dev/hire-quick/audits/2026-09-16/evidence/admin-console.json) · [Login DOM snapshot](/Users/leslieisah/app-dev/hire-quick/audits/2026-09-16/evidence/admin-login-dom.txt)
- [Deterministic scan and typecheck summary](/Users/leslieisah/app-dev/hire-quick/audits/2026-09-16/evidence/deterministic-scan.md)
- [Admin detector output](/Users/leslieisah/app-dev/hire-quick/audits/2026-09-16/evidence/admin-scan.json) · [Mobile detector output](/Users/leslieisah/app-dev/hire-quick/audits/2026-09-16/evidence/mobile-scan.json)
- [Admin typecheck](/Users/leslieisah/app-dev/hire-quick/audits/2026-09-16/evidence/admin-typecheck.txt) · [Mobile typecheck](/Users/leslieisah/app-dev/hire-quick/audits/2026-09-16/evidence/mobile-typecheck.txt)

## Hold this in your hands

HireQuick's mobile design reads like a carefully organized event folder: warm paper, clear sections, and green markers for the next action. That is a promising fit for people who need reassurance while organizing real work. I would keep that character. What currently makes the object difficult to trust is the writing on a few of its most important tabs: estimated becomes held, gross becomes earned, and started becomes submitted. The admin feels more like the working spreadsheet behind that folder, but without enough room for the evidence a reviewer needs. Repairing those promises, the calendar, and the recovery paths would do more for perceived quality than a new font or extra animation. This is a source-informed holistic judgment; I would reserve a final judgment about how it feels in the hand until using the actual mobile app.
