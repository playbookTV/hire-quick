# UX Torture Report — Admin sign-in, session recovery, dispute review

**Status:** HARM FOUND within tested scope; overall coverage remains partial.
**Date:** 2026-09-26
**Declared scope:** Admin web application from a shared working tree initially at HEAD ca398730a1a52e67b9a448e7af92d39179fd9b7a. Another actor committed mobile work as f99e3b4e8d9bb7a86f45f04a1430e2ebcb524da1 during the audit; this is not a frozen-commit release test. Existing unrelated edits were preserved. Real browser interaction used a synthetic localhost API, not production or database-backed end-to-end behaviour.
**Critical journeys tested:** Keyboard OTP sign-in and invalid-code recovery; dispute review and uncertain mutation recovery; restored-session service failure and retry.

## Environment and evidence

- Codex in-app browser, local Vite at `http://127.0.0.1:5179`, explicitly configured with `VITE_API_URL=http://127.0.0.1:4319`.
- Synthetic API: [fixture-server.mjs](ux-evidence/fixture-server.mjs). It uses no database, provider, real identities, or external network. Mutation returns 503 without effect. Its tokens are inert fixture strings.
- [Request log](ux-evidence/requests.ndjson) and [interaction observations](ux-evidence/observations.md) preserve reproduction evidence. Screenshot of 320px invalid-code login was visually inspected in the tool transcript; screenshots were not exported to files.
- Verify graph evidence: project `Users-leslieisah-app-dev-hire-quick`, generation `2026-09-26T09:27:07Z`, full index ready; exact App/Login/Disputes snippets; Login outbound trace returned all six reachable callees through depth 2 without truncation. Coverage for App, Login, Disputes, api, auth, session, BookingReview reported metadata_match / no_recorded_issue. This is best-effort evidence, not completeness proof. Direct source read confirmed API binding/session logic and fixture response contracts. Observability partial parse range was outside declared scope.

## Torture matrix

| Journey | Environment/state combination | Result | Evidence |
|---|---|---|---|
| Sign-in | Keyboard Tab/type/Return, desktop initial page then 320×568 | PASS within tested scope: code field autofocus, incorrect code reported, typed values retained, corrected code signs in | Request log 09:34:26–09:34:45; observations 1–3 |
| Dispute evidence and reasoning | 320×568, one synthetic OPEN dispute, FROZEN escrow | PASS within tested scope: review receives focus, evidence and split visible, empty reasoning disables decision | Observations 4–5 |
| Decision failure | 320×568, synthetic mutation HTTP 503 | PASS within tested scope: unconfirmed outcome shown; reason retained; another decision disabled pending reload; one mutation logged | 09:35:10 request; observations 5–6 |
| Narrow layout | Review panel and table, 320×568 | PASS within tested scope: document width=320; table has labelled horizontal scroll region | Read-only browser DOM measurement |
| Returning session | 320×568, `/api/me` 503 then normal response | PASS within tested scope: Session unavailable; Try again restores original /disputes route | 09:35:25–09:35:39 requests |
| Logout | Expanded mobile navigation | PASS within tested scope: login rendered | 09:35:46 request |
| Stalled code request | 320×568, fixture holds response open | CONFIRMED: recovery unavailable for over 64 seconds | Request log and follow-up observation |

## Findings

### P2 · State / recovery · Stalled sign-in request blocks recovery for over a minute

- **User goal:** Sign in to resolve staffing and payment issues.
- **Observed obstruction:** With the OTP request held open by the controlled fixture, the form becomes `aria-busy=true`; its only button reads “Please wait…” and is disabled. No cancel/retry action is offered in that state.
- **Consequence:** A stalled connection prevents continuing or retrying in the form; refreshing starts over. The first observation was interrupted by an unsolicited reload. A clean repeat stayed busy from 09:44:01.974Z to 09:45:06.339Z (over 64 seconds); both observations showed the sole action disabled. This proves the bounded stall, not an infinite outage.
- **Evidence:** `apps/admin/src/lib/session.ts:159–163` dispatches requestOtp without an AbortSignal/deadline; `apps/admin/src/pages/Login.tsx:12–25` clears busy only after the awaited promise settles. The analogous verify call at session.ts:179 also has no deadline but was not stalled in-browser.
- **Reproduction:** Launch fixture and configured local admin; put `hang` in `ux-evidence/mode.txt`; load admin signed out; type `audit@example.test`; submit. Fixture intentionally leaves OTP request pending. Inspect busy form, disabled button, and absent recovery action. Restore mode to `normal` and reload to end the fixture condition.
- **Proposed local correction:** Give OTP request/verification a bounded abort deadline and recoverable timeout message while retaining inputs; ensure late responses cannot complete a superseded attempt. Keep rate limiting and retry semantics intact.
- **Confidence:** CONFIRMED DEFECT for the bounded 64-second stalled-request condition. Mechanism supported by source; no claim that every real connection stalls forever. No product change made.

## State coverage gaps and research hypotheses

The uncertainty notice remains after Reload records even when the fence has cleared; this may confuse operators, but no incorrect repeated decision was observed, so it is a research hypothesis rather than a confirmed defect. Determining an existing decision's real persistence after provider timeouts needs actual backend fixtures; the local API cannot prove it.

## Not tested

Native Expo/iOS/Android journeys; real keyboard and safe-area behaviour on mobile devices; real identity lifecycle/provider; actual durable decisions, payment transfers and approval execution; assistive screen readers; 200%/400% browser zoom; RTL/localisation expansion; hostile large datasets; offline network stack behaviour; cross-tab state; expired/removed-role sessions; non-Chromium browsers; production deployment. No WCAG conformance or whole-product readiness conclusion is implied.

## Retest plan

After a local timeout correction, hold both OTP endpoints open and verify bounded, announced recovery without input loss; retry with normal fixture and prove only the newest attempt can authenticate. Repeat keyboard invalid-code login and restored-session retry. Re-run the original narrow dispute 503 case and confirm reasoning, fence, latest-data reload, and one logical mutation. Use a disposable database/provider simulator for durable end-to-end decisions before release sign-off.

## Safety and cleanup

One fixture-launch approval was initially rejected because usage was exhausted; after the user's resume, the identical localhost-only operation was approved. No rejected action was bypassed. Local development server and fixture cleanup is recorded when completed below. No production code was modified.

Cleanup complete: stopped the fixture process (session 29572) and Vite process (session 21966), both confirmed exited on SIGINT; reset browser viewport override and closed the agent-created tab. Fixture mode reset to normal. Earlier non-escalated dev-server attempts failed to bind and were not left running.

## Authorized P2 remediation — 2026-09-26

The stalled-login cause is repaired locally in `apps/admin/src/lib/session.ts`. OTP request and verification now have an eight-second deadline covering both fetch and response-body parsing. Timeout aborts the transport and returns an actionable error to the existing Login error state, which retains email/code and re-enables actions. A Promise race also bounds callers whose transport ignores abort. Late successful verification cannot reach session persistence; its returned refresh token is revoked best-effort. Existing login generation, logout, storage tombstone, and role checks remain intact. No Login JSX change or structural refactor was needed.

Regression evidence: three new timeout regression cases failed against original code; all 30 admin session/checker tests passed after repair. The parameterized stall cases exercise both request and verify endpoints, fetch and body stalls, ignored abort, normal retry, late response after replacement login, late verification after logout, and timer cleanup. Tests used a standalone Vitest config with no dotenv/database setup. Admin typecheck and session-file lint passed. Existing API lint configuration excludes its test directory, so the test file was not linted by that command.

The specialist initially could not access a browser and its fixture launch approval timed out. The orchestrator subsequently recovered the browser and received approval for both local-only servers, resolving that limitation. Actual 320×568 browser retests now verify request timeout → retained email → successful retry, and verification timeout → retained email/code → successful retry → Dashboard. Both timeout alerts and enabled recovery controls were inspected in the accessibility tree and screenshots. See [P2 remediation](p2-remediation.md) and the appended request log. The fixture supports `hang-verify`; its mode was reset, both retest servers stopped, viewport reset and temporary tab closed.
