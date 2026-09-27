# Deeper mobile experience review — 26 September 2026

The deeper problem is consistency across a journey: the screen a person sees, the action it offers, and the account/order state behind it sometimes disagree. These gaps deserve attention before further decorative polish. The approved Figma palette, typefaces and overall composition can remain intact.

This extends [the first review](ui-improvement-review-2026-09-26.md). It is a review, not an implementation release. No application source or production data was changed.

## Evidence and limits

- Traced client staff selection → payment summary → pending booking recovery, and usher verification → applying → attendance → earnings → withdrawal.
- Read the approved settlement policy before assessing release messages. It supersedes earlier drafts: completed bookings remain held until at least scheduled event end + 72 hours, subject to dispute and settlement conditions. Bank withdrawal is a separate action.
- Interacted with the actual Profile Setup and Awaiting Approval components in a local React Native Web fixture. The fixture simulated API/auth outcomes and navigation; photo uploads were placeholders. This reproduced two refresh failures and the hidden form constraint. It is not a live-account or native-device test.
- Evaluated the exact withdrawal rounding expressions with representative kobo balances.
- Other findings below are verified source paths with concrete triggering conditions, not claims of completed payments or native-device reproductions. There is no finding of ledger corruption or double charging.
- The two broader journey reviews ran independently. Graph verification used project `Users-leslieisah-app-dev-hire-quick`, generation `2026-09-26T08:51:00Z`, matching source metadata on cited code. A recorded parse gap in `dispute.tsx:96` was read directly when checking alternative bank-account entry points. Coverage is best effort.

## Fix before shipping

### 1. P1 — An unpaid booking cannot reliably resume on another phone

**Trigger:** Create an unpaid booking on device A, then open it on device B or after local app storage is lost. Tap **Resume event checkout**.

**Current path:** Booking Details passes only the event ID. Payment Summary obtains staff IDs from a saved local checkout or an `apps` navigation parameter. Neither exists in this case. The screen can show **Booking 0 ushers / Pay ₦0**, with payment disabled. Zero chosen staff equals zero expected staff, so its mismatch guard misses this case.

**Smallest complete fix:** Recover the existing authoritative order, its staff and total from the server. Resume that same order/reference; do not create a new order to recover a checkout. Merely linking to the existing order-status screen is insufficient because that route currently hides Resume Paystack when supplied an order parameter.

**Acceptance:** An unpaid order with empty local storage shows the original people and amount, then resumes the original payment. No replacement order is created.

**Evidence:** `apps/mobile/app/(modals)/booking-details.tsx:180–188`; `payment-summary.tsx:32–35,53–55,105,257`; `apps/mobile/lib/checkout.ts:38–43`; `apps/mobile/app/(modals)/funds-held.tsx:93`. The booking endpoint includes the order association: `apps/api/src/modules/bookings/routes.ts:174–181`.

### 2. P1 — A payment summary can omit the people being booked

**Trigger:** A saved checkout outcome exists, but fetching applications fails and there is no cached application data.

**Current path:** The selected people become an empty list. The completeness guard is bypassed when a saved outcome exists; the full saved total and enabled **Resume saved checkout** action can remain visible without named staff rows.

**Smallest fix:** Render the saved order's authoritative line items, or show a specific retry state until the selected people can be identified. An incomplete summary must not present itself as complete.

**Acceptance:** Saved outcome plus a failed applications request never produces a payable-looking summary with an empty roster. Recovery retains the same order.

**Evidence:** `apps/mobile/app/(modals)/payment-summary.tsx:50–55,95–105,172–185,249–258`.

### 3. P1 — Staff selection can silently turn a connection problem into zero capacity and zero prices

**Trigger A:** Applications load but the separate event request fails with no cached event.

**Current path:** Slots and per-person budget default to zero. Selection and payment become disabled, while the screen's visible error handling covers the applications request only.

**Trigger B:** Reading the saved checkout fails. The payment action is disabled without explaining that failed dependency or offering its retry.

**Smallest fix:** Treat unavailable event/staffing/checkout data as unavailable, not zero. Show an error for the failed dependency and retry it while retaining selections.

**Acceptance:** Independently failing the event request or local checkout read produces understandable feedback and a working retry; no invented zero rate is displayed.

**Evidence:** `apps/mobile/app/(modals)/applications.tsx:39–42,61–64,195–196,298–329,342–347`.

### 4. P1 — “Withdraw all” does not withdraw the full balance

**Trigger:** An available balance contains fractional naira, which can result from valid integer-kobo settlement calculations.

**Current behavior:** Both the initial amount and Withdraw all use `Math.floor(available / 100)`. The numeric keyboard also lacks a decimal key.

| Available balance | Amount populated | Left behind |
|---|---:|---:|
| ₦42.51 | ₦42.00 | ₦0.51 |
| ₦0.99 | ₦0.00 | ₦0.99; review is disabled |
| ₦100.01 | ₦100.00 | ₦0.01 |

These results were reproduced using the exact expression; no withdrawal was initiated. The shared input schema permits positive integer kobo. This finding does not establish provider-specific minimum-transfer rules.

**Smallest fix:** Format the full amount with two decimal places, support decimal entry, and parse to integer kobo. Keep Withdraw all's visible amount, accessible label, review amount and submitted amount identical. Surface any authoritative transfer minimum separately.

**Acceptance:** An odd-kobo balance populates the exact balance, and the review and request agree to the kobo.

**Evidence:** `apps/mobile/app/(modals)/withdraw.tsx:69–74,447–465`; approved settlement policy's 4,251-kobo payout example.

### 5. P1 — Payout reassurance contradicts the approved holding period

**Current messages:** Applications says funds stay held “until check-in”; Payment Summary refers to attendance/completion; Check-in success says the money will be released when the booking is completed after the event. Booking Details and the approved policy describe the later release conditions.

**User consequence:** An usher can reasonably expect money to become withdrawable immediately after completing work, then encounter a held balance. Clients receive a different explanation earlier in the same transaction.

**Smallest fix:** Use a shared release explanation and, when available, the authoritative earliest-release date. Separate “attendance confirmed,” “booking completed,” “released to wallet” and “withdrawn to bank.” A deadline is the earliest eligibility time, not a guaranteed immediate bank transfer.

**Acceptance:** Staff selection, payment confirmation, attendance success, booking detail and wallet describe the same conditions. No state before wallet credit claims that earnings are available.

**Evidence:** `apps/mobile/app/(modals)/applications.tsx:354`; `payment-summary.tsx:234–236`; `check-in.tsx:145–157`; `booking-details.tsx:22–24,96–105`; [approved policy](payments/approved-settlement-policy-2026-09-21.md).

### 6. P1 — Verification approval and application eligibility can disagree after a failed refresh

**Trigger:** Verification becomes approved while the authenticated profile still says unverified. The profile refresh then fails.

**Current path:** Awaiting Approval presents **You’re verified / Start applying** based on the verification request. Its effect attempts the separate profile refresh once. If that returns `null`, the effect's dependencies remain unchanged. **Check latest status** refetches verification only, so it does not retry the failed profile sync. Event Details still reads eligibility from the stale authenticated profile.

**Observed in the local fixture:** The actual approval component showed success after refresh returned null. Clicking Check latest status increased verification checks to one while profile-refresh attempts remained at one.

**Smallest fix:** Make refreshing account eligibility part of the approval handoff and its retry action. Explain a failed sync and preserve access to browsing. Only promise that applying is ready once the relevant account state agrees.

**Acceptance:** Simulate approval followed by a failed account refresh. Retrying restores eligibility without requiring sign-out or app restart.

**Evidence:** `apps/mobile/app/(verification)/awaiting-approval.tsx:110–114,159–165,234–237`; `apps/mobile/lib/auth-session.ts:152–173`; `apps/mobile/app/(modals)/event-details.tsx`, verified eligibility and disabled-action branches.

The related Profile Setup finding from the first review was also reproduced: after simulated save success followed by refresh returning null, the actual component still called navigation to ID verification. Fix both handoffs together.

## Next usability pass

### 7. P2 — The first saved bank account removes the entry point for adding another

Once saved accounts exist, the withdrawal screen renders their list instead of the add-account form. There is no alternative mobile caller of the add-account hook in the inspected route/component scope.

Add **Add another account** beneath the saved accounts, reusing the existing form. Keep the previous destination selected until the new account is saved successfully. Display the bank's name rather than its raw code.

**Acceptance:** A person with one saved account can add a second and choose it without removing the first.

**Evidence:** `apps/mobile/app/(modals)/withdraw.tsx:435–445`; `useAddBankAccount` caller trace and mobile route/component source check.

### 8. P2 — “Verify your identity to apply” looks like a next step but cannot be tapped

The action is disabled whenever verification is not VERIFIED. It gives no direct route to the required task and treats not-started, pending and rejected verification the same way.

Make that action open the relevant verification step, status or retry screen. Applying itself remains gated. The pending state should say **Verification in review**, with a way to check it.

**Evidence:** `apps/mobile/app/(modals)/event-details.tsx:211–224`.

### 9. P2 — Cancelled, disputed and no-show jobs receive success-colored badges

Applied job cards assign emerald to every booking except PENDING_PAYMENT. The words may be accurate, but the status treatment sends the wrong signal for adverse outcomes.

Map each actual booking status through the shared status treatment. Preserve neutral, attention and adverse meanings consistently across jobs, booking detail and wallet.

**Evidence:** `apps/mobile/app/(usher)/jobs.tsx:207`.

### 10. P2 — “Message all” opens an unfiltered conversation list

The event action navigates to the general Messages tab without an event or recipient selection. It neither starts a message to everyone nor identifies the event's crew.

If the intended destination remains the conversation list, label the action **Messages**. Retain **Message all** only when an explicit event-recipient workflow exists.

**Evidence:** `apps/mobile/app/(client)/events/[id].tsx:221`; `apps/mobile/app/(client)/messages.tsx:7–9`.

### 11. P2 — ID selection communicates its selected state visually only

NIN and BVN are rendered as generic Buttons, with primary/ghost styles indicating the selected option. Button exposes disabled and busy states but no selected state; it cannot receive one through its current props.

Use the existing selectable-control pattern or extend the control to expose radio/selected semantics. Preserve the current placement and styling. Verify with VoiceOver and TalkBack before marking this complete; the source gap is confirmed, the native announcement was not tested.

**Evidence:** `apps/mobile/app/(verification)/id-verification.tsx:141–151`; `apps/mobile/components/Button.tsx`, props and `accessibilityState`.

## What the interaction checks established

| Action in local fixture | Observed result | Meaning |
|---|---|---|
| Entered a sample name and bio in actual Profile Setup | Continue became enabled | Exercised real form state rather than a static screenshot. |
| Submitted with simulated successful save and failed refresh | Navigation callback received the ID-verification route | Confirms the unguarded handoff. Does not prove a native reload or a lost server save. |
| Entered 61 years of experience | Continue became disabled; no field-level explanation appeared | Confirms the hidden validation requirement. |
| Enabled 200% theme text | Text enlarged and reflowed in the form | Limited visual check only; not an OS Dynamic Type certification. |
| Opened actual Awaiting Approval with approved verification and failed profile refresh | Success copy and Start applying remained | Confirms success is driven by verification data independently of profile synchronization. |
| Tapped Check latest status | Status request ran; profile-refresh count did not increase | Confirms the missing retry link. |

The fixture's browser console had no captured warnings/errors when checked. This does not certify the full app, native modules, or production requests. Full end-to-end interaction audit remains incomplete; no passing audit verdict is claimed.

## Design implications

The existing visual foundation is coherent. The next improvement is a consistent set of states and actions throughout the app:

- Put a truthful next step beside the state that requires it: verify, retry, resume, or change account.
- Separate unknown data from zero values, and saved server state from missing local state.
- Keep people, amount and event visible together before a consequential action.
- Let status wording and color tell the same story across every screen.
- Keep the same financial vocabulary throughout: held, eligible for release, available in wallet, and sent to bank.

These are refinements to the current design, not a reason to replace it. The first review's field guidance, accurate filter labels/counts, bookmark feedback, and empty-search recovery still apply.

## Recommended order

1. `/harden`: server-backed checkout recovery, complete payment summaries, and failed dependency recovery.
2. `/harden`: profile/verification handoffs and exact withdrawal amounts.
3. `/clarify`: unify release messages and correct action labels.
4. `/adapt`: selectable ID semantics and device checks for enlarged text, keyboard reachability and screen-reader state.
5. `/polish`: bank-account entry points, booking-status treatment, and the previously identified form/filter/recovery refinements.

For implementation, use targeted failure-path tests for the money and handoff issues, then verify affected flows on Android and iOS. Native build/export success alone is insufficient to verify these behaviors.
