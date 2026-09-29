# Six-hour verification cooldown deployment — 2026-09-28

The user authorized deployment and explicitly excluded mobile. The API and worker were deployed from a frozen copy of the previous Sentry release (`de14bb9078dfa13ed8e5cdbd1fa5f4100c4bb6dd`) with the reviewed cooldown service, tests, and documentation overlaid. Comparison confirmed that the only backend source differences from the preceding release were the verification service and its tests. Existing Sentry changes were preserved.

- API: `3c42ac19-0c87-46d9-86b2-96ad6ed44570` — SUCCESS.
- Worker: `92759f75-6e80-4696-907e-48e82e3b3d45` — SUCCESS.
- Railway environment: `production`; existing application mode remains `staging`.
- No mobile build, submission, or OTA update; no admin or website deployment.
- No database migration or manual customer-data mutation.

The API permits five new Smile sessions in a rolling six-hour window and reports the remaining cooldown. Source and compiled verification-module hashes on both deployed services match the tested local code. The existing Sentry initialization and privacy-module hashes also match the previous release. Live `/health` and `/ready` returned HTTP 200. The worker registered scheduled jobs and completed `storageCleanup` successfully.

Before deployment, four focused cooldown tests passed, along with API/test type checks, targeted lint, documentation links, and whitespace checks. The prior full verification suite passed before the duration was shortened; see the [six-hour change record](verification-cooldown-six-hours-2026-09-28.md). No customer verification session or paid provider request was created as a smoke test, and the pictured account's verification was not exercised.

Evidence: [release manifest](validation-evidence/2026-09-28/cooldown-release/release-manifest.json), [deployment status](validation-evidence/2026-09-28/cooldown-release/deployment-status.json), [runtime hashes](validation-evidence/2026-09-28/cooldown-release/runtime-checks.json), and [HTTP checks](validation-evidence/2026-09-28/cooldown-release/http-checks.json).

Rollback targets are recorded in the manifest: API `557d76aa-0dcc-4ea2-8c7f-e4ba7ccae63b`, worker `b4c83d93-960c-49a8-8dcc-e8115c7309d6`. Rolling back restores the previous lifetime cap; no data rollback is required.
