# HTTP test transport correction — 27 September 2026

Status: FIXED AND VERIFIED in the local workspace. Scope: OVA-179's intermittent HTTP failures in the local API test suite. Production request handling and database behavior are unchanged.

## Reproduction and causal evidence

The reported broad run returned inconsistent HTTP status codes and socket resets across otherwise unrelated tests. Fresh Node 22.23.3 runs reproduced three failures in the full suite after two clean runs. Temporary Supertest instrumentation stamped each intended server response with a unique marker. All three failures lacked that marker: one received an HTTPS-only server's rejection, another a foreign plain-text 404, and another reset the connection.

The installed Supertest 7.2.2 `serverAddress` implementation starts an unbound HTTP server with `listen(0)`, then constructs an IPv4 `127.0.0.1` URL regardless of the server's address family. On this macOS host, an IPv6 wildcard listener can receive a port already owned by another service on IPv4. The client then reaches that other service. Which ephemeral port is allocated determines whether a test fails; the application route and test order are not the underlying cause of these reproduced failures.

A minimal program with no HireQuick imports or database access created 20,000 short-lived HTTP test servers and sent fixture POSTs. Eighteen requests received foreign responses or resets. An otherwise identical run using IPv6 loopback for IPv6 listeners had zero failures. This rejects application authorization, database fixture contamination, and shared connection reuse as necessary causes of this reproduction (Superagent uses `agent: false`).

The permanent regression controls both listeners: a foreign IPv4 server returns 403, while the intended IPv6 server on the same numeric port returns 201. Before the patch it failed with 403; afterward it reaches the intended server and asserts the foreign server received zero requests. A companion test protects explicitly bound IPv4 behavior. Neither test uses an external service.

## Correction and scope

The tracked pnpm patch `patches/supertest@7.2.2.patch` selects IPv6 loopback for IPv6-bound test servers and preserves IPv4 loopback for IPv4 servers. The manifest and lockfile apply it consistently on installation. No dependency version changed. pnpm also refreshed two transitive-peer metadata entries; existing unrelated lockfile changes were preserved.

Only the development HTTP testing dependency changes behavior. No hosted deployment, financial operation, schema change, production route edit, retry, or weakened assertion is part of this correction. Existing modified workspace files were retained. Remove the patch only after an upgraded Supertest passes the address-family regression; rollback is removal of its manifest/lock registration and patch followed by reinstall, which restores the known defect.

## Validation

- Deterministic regression: one failed / one passed before; two passed after, through disposable-schema migration and isolation checks.
- Three pre-fix full runs this turn: two clean; one with three failures. Two runs used temporary marker instrumentation; one of those reproduced the failures. These observations characterize intermittency, not a statistical failure-rate guarantee.
- 20,000-request causal experiment: 18 failures before, zero with address-family correction.
- Installed patch, original stress program without diagnostic overrides: 20,000 requests, zero failures.
- Two post-fix full serial API runs: **954 passed, zero failed, one skipped** each, across 104 files. Both ran without temporary instrumentation; the second followed a successful offline frozen-lockfile installation.
- Both runs passed all 50 provider lifecycle checks, tracked migrations, zero migration drift and disposable-schema cleanup.
- Workspace typecheck/lint and test-source typecheck/lint passed. Existing lint warnings remain. Documentation links and whitespace checks passed.
- The single skipped case is the real R2 storage round-trip. No hosted CI job or native acceptance was run.

See [final validation](validation-evidence/2026-09-27/test-transport/validation.json) and [installed stress evidence](validation-evidence/2026-09-27/test-transport/installed-stress.json).

Evidence: [diagnosis](validation-evidence/2026-09-27/test-transport/diagnosis.json), [source manifest](validation-evidence/2026-09-27/test-transport/source-manifest.json). Raw local logs and temporary instrumentation remain under `/private/tmp/hq-http-*` and `/private/tmp/hq-flake-*`. Instrumentation is not part of the patch.

## Residual scope

This proves and corrects the reproduced transport misrouting. It does not establish the origin of every historical failure without captured responses, nor certify hosted/native/provider behavior. The exact release/CI sign-off in OVA-179 remains separate from local workspace validation. The real storage round-trip still requires its authorized external credentials.

The temporary PostgreSQL server was stopped after both validation schemas were removed. Following explicit user approval, the diagnosis and verification summary was posted to OVA-179 at 22:34 UTC (comment `6c191dd2-39c0-4b85-bbc1-41c43d0b2f2e`). The issue remains In Review pending exact release/hosted CI sign-off.
