# Booking and privacy validation — 14 September 2026

Final local validation records **176 distinct passing tests**: **55 new pure cases** and **121 DB cases** across two runs. The DB total includes 34 cases specific to these features and 87 affected existing regressions. All feature-specific checks and the remaining financial/admin regressions passed. The first run's nine venue fixture failures are resolved by the corrective run; this is not one clean full-suite invocation. The previous batch's 311 tests are not counted as fresh evidence.

Root coordinates three workers, approves designs, reviews integration and runs all serial database checks. Workers report checkpoints and independent reviews. Earlier working-tree edits are preserved; these changes are local, with no merge or deployment claimed. Final Linear readback returned all 103 project issues with no next page: OVA-149, OVA-140, OVA-148 and OVA-153 are all In Review, and 39 Todo issues remain. See the [orchestration record](booking-privacy-orchestration-2026-09-14.md).

## Scope and evidence

All paths below are relative to the repository root.

| Ticket  | Behavior and ownership                                                                                                                            | Current validation                                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OVA-140 | Validation worker: shared venue serialization for discovery, applications, saved jobs, invitations and booking reads; root reviewed               | `apps/api/src/modules/events/__tests__/venue.unit.test.ts`: 12 passed. `apps/api/src/modules/events/__tests__/venue-privacy.test.ts`: 9 passed on the corrected ACTIVE-user fixtures |
| OVA-149 | Provider worker: booking/sender/media namespace binding, authorized signing and guarded legacy-media cleanup; root and validation worker reviewed | `apps/api/src/modules/storage/__tests__/chat-media.unit.test.ts`: 31 passed. `apps/api/src/modules/storage/__tests__/chat-media.test.ts`: 10 DB cases passed                         |
| OVA-148 | Booking worker: eligibility, schedule serialization and staffing lifecycle; root integrates payment/admin callers                                 | `apps/api/src/modules/events/__tests__/staffing.unit.test.ts`: 12 passed; shared `apps/api/src/modules/events/__tests__/recruitment-lifecycle.test.ts`: 15 DB cases passed           |
| OVA-153 | Booking worker: atomic invitation replies and application withdrawal, without reviving declined/expired invitations                               | Included in the same 15-case `recruitment-lifecycle.test.ts`; counted once, all 15 DB cases passed                                                                                   |

OVA-140's pure matrix includes every booking status, owner/admin views and non-mutating masking. Its HTTP cases exercise all eight affected usher paths: `/events`, `/events/:id`, `/me/applications`, `/me/saved-jobs`, `/me/invitations`, `/invitations/:id`, `/bookings` and `/bookings/:id`. Cases cover pending, confirmed, cancelled/refunded/no-show states, another usher's paid booking, multiple bookings for the same event, owner visibility and existing party checks. Fixtures seed booking states to test response authorization; they do not demonstrate provider funding.

OVA-149's HTTP/DB cases cover authorized image/voice use, foreign key rejection, the shared Socket.IO send boundary, signing authorization, MIME/purpose mismatch, unavailable storage, malicious legacy references, cross-conversation download and guarded retention. The two final cases check mismatched legacy client and usher ownership before deletion. Storage is mocked; real S3 uploads/downloads/deletes are not exercised.

## Independent review and corrections

- All nine initial venue HTTP cases returned 403 before reaching the feature: the fixture omitted `User.status`, whose schema default is PENDING, while authentication requires ACTIVE. The fixture now explicitly creates ACTIVE users and includes safe error-code assertion diagnostics. This does not change production authorization; all nine then passed on the corrective run in 127.639 seconds.
- Venue review confirmed that `venue` is the structured precise-location field in the affected Event joins. The existing allowed states—CONFIRMED, CHECKED_IN, COMPLETED, PAID and DISPUTED—are preserved. One eligible booking unlocks the event consistently for that usher, even if an older pending row exists. Owner visibility and existing admin/party gates remain; no new admin access is added to booking routes.
- Media review found no concrete authorization bypass in the bounded helper, signing routes, shared send function, history serialization and retention block. Keys must match the entire canonical namespace, booking, sender and media type/extension. Signing checks current booking parties/status; download also checks the stored message's conversation. Invalid legacy references are hidden from history and excluded from object deletion.
- Independent review requested a regression for retention's mismatched conversation-party branch. The media worker added both client- and usher-mismatch cases; both passed in the first DB run. The review is source evidence, not a claim of exhaustive security certification.
- Independent provider-worker review found a PostgreSQL `void` deserialization issue in the schedule advisory-lock query. The booking worker added an explicit cast; the 15-case recruitment DB suite, including real concurrency cases, passed.
- Independent booking review also required current status, arrival/time eligibility, dispute and refund state to be reread under the lifecycle lock before auto-completion. Historical future staffing vacancies are repaired in keyset pages of 100. Root and the independent reviewer confirmed all three corrections in source, with no remaining concrete finding in the scoped changes; the new 15-case recruitment suite and the broader affected regressions passed.
- Invitation decisions preserve terminal declined/expired cycles without implicit reset; ordinary rejected applications may still reapply. Existing pending-payment reservations remain occupied until OVA-135 resolves their recovery/expiry. These are deliberate scope boundaries, not unimplemented invitation retries.

## Isolation and static checks

`/private/tmp/hq_validation_20260914160745_1a2b5f3d.log` records a successful **read-only direct-database preflight** against PostgreSQL 18.6. Its observed schema was `public`; no schema was created and no migration or fixture write was performed in that preflight. This is connection evidence only, not proof of disposable test isolation.

| Run log under `/private/tmp/`               | Outcome                                                                                                                                                                                  |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hq_validation_20260914161102_2b7ca297.log` | 14 passed, 9 venue fixture failures across 23 cases; 155.86 seconds. All 10 media and four existing chat/gateway cases passed. Schema removal confirmed                                  |
| `hq_validation_20260914161630_4d95b859.log` | Final affected run: **107/107 passed across 14 files**, 1,869.79 seconds. Corrected venue 9 and recruitment 15 passed alongside payment/auth/admin regressions. Schema removal confirmed |

Both runs passed direct routing with eight distinct simultaneous connections, matching ORM schema/startup search path, all five tracked migrations and the migration-drift guard. Cleanup explicitly removed `hq_validation_20260914161102_2b7ca297` and `hq_validation_20260914161630_4d95b859`. New DB suites fail closed before fixture work unless the disposable-database guard passes.

The 107-case run's file-level evidence is below; paths are relative to `apps/api/src/`. The first run's successful media 10, gateway 3 and chat 1 are distinct from these files. Its failed venue invocation is replaced by the nine passing cases below, never added to the passing total.

| Test path                                                | Passed |
| -------------------------------------------------------- | -----: |
| `modules/payments/__tests__/operation-recovery.test.ts`  |     17 |
| `modules/events/__tests__/recruitment-lifecycle.test.ts` |     15 |
| `modules/auth/__tests__/otp-consumption.test.ts`         |     15 |
| `modules/events/__tests__/checkout-validation.test.ts`   |     11 |
| `modules/payments/__tests__/terminal-operations.test.ts` |      9 |
| `modules/bookings/__tests__/lifecycle.test.ts`           |      3 |
| `modules/payments/__tests__/withdrawal-outcomes.test.ts` |     11 |
| `modules/events/__tests__/venue-privacy.test.ts`         |      9 |
| `modules/payments/__tests__/ledger.test.ts`              |      6 |
| `modules/payments/__tests__/remediation.test.ts`         |      4 |
| `modules/admin/__tests__/admin.test.ts`                  |      2 |
| `modules/payments/__tests__/webhook.test.ts`             |      2 |
| `modules/payments/__tests__/reconciliation.test.ts`      |      2 |
| `modules/payments/__tests__/concurrency.test.ts`         |      1 |

For OVA-140, API production typecheck, strict test typecheck, root test lint, focused production lint and scoped `git diff --check` passed. Root forced all 14 workspace tasks at the initial integrated snapshot: 14/14 passed with no cache hits in 28.768 seconds (`/private/tmp/hq-booking-privacy-static-20260914.log`). Final dedicated root test lint also passed (`/private/tmp/hq-booking-privacy-test-lint-final-20260914.log`). Root also freshly reran the three new pure suites together: 55/55 passed in 1.39 seconds at 17:16:32 local. The new staffing/recruitment suites subsequently passed API production and strict test typechecks, focused production/test lint and diff checks (worker evidence). Root’s final whole-workspace `git diff --check` also passed.

## Boundaries

Graph MCP tools were unavailable; Verify-tier evidence uses exact source reads/searches, with graph generation and index coverage unknown. No native-device or browser interaction, actual provider contract certification, financial transfer, deployed storage test, remote CI run or deployment is part of this batch. Media upload completion/content validation remains OVA-174; durable cleanup retries remain OVA-146; retention timing/holds remain OVA-162. Pending checkout expiry/recovery remains OVA-135. These limits are not counted as completed acceptance criteria.
