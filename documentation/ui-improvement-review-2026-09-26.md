# Mobile UI improvement review — 26 September 2026

Follow-up: [the deeper journey review](ui-deep-review-2026-09-26.md) traces checkout, verification, attendance and withdrawal and includes local interaction reproductions.

This review preserves the approved Figma direction. The strongest opportunities are clearer requirements, accurate state labels, and reliable recovery. No application code was changed during this review.

Scope: Profile Setup, Jobs, Wallet, Discover, and the linked Filters screen. Findings come from current source and relevant call paths. Actual screen interactions, physical-device behavior, and Figma fidelity were not re-tested in this review. The localhost preview is a shared-component fixture, not these complete screens.

## Priorities

### 1. P1 — Keep profile completion reliable through the final refresh

After saving, Profile Setup navigates to identity verification regardless of what `refreshMe()` returns. That method returns `null` after a failed refresh. The button's pending state covers the mutation, but not the subsequent refresh. The app can therefore advance with stale profile state and make the action available again before the whole operation finishes.

Keep one submitting state across save and refresh. Advance only after a confirmed profile; otherwise preserve the fields and provide an explicit retry. Distinguish a successful save followed by a refresh failure so the message does not incorrectly say the save failed.

Evidence: `apps/mobile/app/(verification)/profile-setup.tsx:40–58,137–147`; `apps/mobile/lib/auth-session.ts:152–173`. This is a separate failure path from the previously fixed admin-account onboarding issue, and is not a claim that it caused the earlier Android report.

Suggested action: `/harden`, followed by `/polish`. Validate save success followed by refresh timeout, successful retry, and repeated taps.

### 2. P2 — Make discovery filters describe the actual results

Filters permits a 4-star minimum, but Discover displays “4.5+” for every active minimum rating. The modal's result preview also omits Discover's current search term. On an initial preview failure, missing data becomes a count of zero.

Generate the rating chip from the selected value. Use the same search and filter criteria for the preview and destination. When the count is unavailable, show “Apply filters” with an explicit recovery state rather than presenting a false zero.

Evidence: `apps/mobile/app/(modals)/filters.tsx:43–49,90`; `apps/mobile/app/(client)/discover.tsx:61–65,169–174`.

Suggested action: `/harden` and `/clarify`. Validate a 4-star selection, an existing search plus filters, and a failed count request.

### 3. P2 — Explain why profile setup cannot continue

Continue is disabled for a short name or bio, or an invalid experience value, without nearby guidance explaining those requirements. The visual form can look complete while the next step remains unavailable.

Identify required and optional inputs, add brief guidance, and show field-level feedback when relevant. Keep this inside the existing field layout and avoid presenting validation errors before users have interacted.

Evidence: `apps/mobile/app/(verification)/profile-setup.tsx:75–91,137–147`.

Suggested action: `/clarify`. Validate blank, short, and invalid values, including screen-reader announcements.

### 4. P2 — Confirm bookmark actions and explain failures

Jobs calls save and unsave mutations without presenting their pending or error states. The hooks invalidate saved jobs after success but do not provide an error handler, and the shared query configuration does not supply a global mutation error notification. On a failed request, the user receives no explanation at that action.

Show a per-job pending state, prevent duplicate requests for that item, and provide concise success or failure feedback. Keep the last confirmed saved state if the request fails.

Evidence: `apps/mobile/app/(usher)/jobs.tsx:88`; `apps/mobile/lib/hooks.ts:283–299`; `apps/mobile/lib/query.ts:8–19`; `apps/mobile/components/JobCard.tsx:82–105`.

Suggested action: `/harden` and `/delight`. Validate successful save/unsave, request failure, and repeated taps.

### 5. P2 — Give empty searches a direct way forward

Discover's no-match state says “No ushers match your search yet,” but offers no contextual recovery action there. Users must work out whether the search or filters excluded everyone.

Reuse the existing EmptyState treatment. Offer “Clear search” and/or “Reset filters” only when applicable, preserving unaffected criteria. Distinguish a truly empty marketplace from an overly restricted search.

Evidence: `apps/mobile/app/(client)/discover.tsx:252–255`; filter reset at `apps/mobile/app/(modals)/filters.tsx:120`.

Suggested action: `/clarify` and `/polish`.

## What already works

- Jobs has clear Available, Applied, and Saved groupings, useful empty states, and net earnings on cards.
- Wallet separates available, held, and awaiting-payment money. Missing booking data becomes “Unavailable” rather than an invented zero.
- Discover retains cached results with an out-of-date notice and a refresh action.
- Shared typography, spacing, color, and components support these improvements without changing the approved composition.

## Independent anti-pattern assessment

The source review found no reason to replace the approved palette, typography, or screen hierarchy. An aesthetic verdict about whether the actual screens look generic requires a fresh visual review; source inspection alone cannot establish it.

The independent Impeccable 4.1.0 scanner (engine 0.1.5) returned zero primary or advisory findings across Profile Setup, Jobs, Wallet, Discover, and JobCard. Both the standard run and the run without project configuration exited successfully with an empty findings array. TSX is scanned in regex mode: this does not validate native rendering, resolved theme colors, touch behavior, async failures, screen-reader behavior, or font scaling. No false positives arose, and no browser overlay was applied. The source-backed usability findings above remain actionable despite the clean automated result.

## Optional refinements

Wallet's “event end + 72h” wording could explain the timing in plain language. Held and Pending currently lead to the same general booking destination; a relevant category or booking would reduce searching. Any expected release date must come from authoritative data and preserve the existing escrow policy. Evidence: `apps/mobile/app/(usher)/wallet.tsx:26–27,70–123`.

Avoid implying a guaranteed daily supply of jobs in an empty state unless the service can support that promise. Evidence: `apps/mobile/app/(usher)/jobs.tsx`, available-jobs empty state.

## Provisional usability score

This is a bounded source-review score, not a physical-device accessibility certification or a score for the whole product. The first independent assessment scored 25/40; the combined assessment lowers system status by one point for the confirmed profile-refresh and bookmark-feedback gaps.

| Heuristic | Score / 4 | Main evidence |
|---|---:|---|
| System status | 2 | Loading and retry patterns exist; profile completion and bookmarks have feedback gaps. |
| Real-world language | 3 | Familiar actions; wallet timing needs plainer language. |
| User control | 3 | Back, reset and tabs exist; empty search recovery is indirect. |
| Consistency | 2 | Shared components are coherent; rating labels contradict the selected filter. |
| Error prevention | 2 | Guards exist, but requirements and submission state need improvement. |
| Recognition over recall | 3 | Visible tabs and chips; wallet drill-down loses category context. |
| Efficiency | 2 | Saved jobs and filtering help; recovery adds unnecessary steps. |
| Aesthetic/minimalism | 3 | Source structure groups information; visual judgment remains provisional. |
| Error recovery | 2 | Major queries have retry paths; the listed action failures need clearer recovery. |
| Contextual help | 2 | Useful guidance exists, but form and release conditions need more context. |
| **Total** | **24 / 40** | **Acceptable under the critique rubric; targeted improvements needed.** |

## Persona checks

- **First-time usher:** hidden profile requirements make a disabled Continue button difficult to understand.
- **Distracted mobile user:** an interrupted request needs a clear outcome; empty searches should provide an immediate recovery action.
- **Client selecting staff:** a 4-star selection labeled 4.5+ and inconsistent preview counts undermine confidence in the shortlist.
- Screen-reader, enlarged-text, and one-handed interaction on the actual screens remain unverified in this review.

## Cognitive load and emotional journey

The eight-item source checklist finds two concerns: users must infer hidden requirements (working-memory burden), and filter/search recovery is not exposed where the problem appears (progressive disclosure). Single-task focus, grouping, and limited top-level choices are supported by the three Jobs tabs and the profile's primary Continue action. Chunking, actual visual hierarchy, and whether each viewport presents one manageable decision remain provisional without viewing the complete screens. Therefore two observed concerns suggest moderate cognitive load in those paths, but are not a complete rendered-screen score. The four language choices are a manageable group; no claim is made about the number of all simultaneously visible options on a phone.

The intended emotional journey is calm confidence: see a clear next step, act, and receive a trustworthy outcome. The source suggests potential frustration at a disabled form, uncertainty after an unacknowledged bookmark failure, and reduced trust when filter labels disagree. These are hypotheses about user experience rather than measured user reactions. Reliable confirmation and recovery should improve the end of each flow before adding further decorative delight.

## Evidence limits and implementation order

Graph project `Users-leslieisah-app-dev-hire-quick` was ready at generation `2026-09-26T08:36:37Z`. Relevant inspected paths had matching metadata and no recorded coverage gap. This is best-effort coverage; exact source was used for material findings.

Implement the profile completion fix first, then accurate filters and bookmark feedback, then form guidance and empty-state recovery. Finish with `/polish` to check spacing, wrapping, focus, and reduced motion within the existing design system. Optional wallet changes should follow a check against the authoritative release policy.
