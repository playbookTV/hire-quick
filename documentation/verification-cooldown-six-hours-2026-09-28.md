# Six-hour verification cooldown — 2026-09-28

The user selected six hours, superseding the initial 24-hour default in the [earlier implementation record](verification-cooldown-2026-09-28.md).

The API now permits five new Smile sessions in a rolling six-hour window. Each session stops counting exactly six hours after creation. The blocked-start message and maintained [Smile ID guide](../docs/SMILE-ID.md) use six hours. History retention, row locking, and existing-session refresh behavior are unchanged.

Verification: API and test-source type checks, targeted production/test lint, documentation links, and diff whitespace checks passed. Four focused database tests passed: exact six-hour expiry with retained history; remaining-wait messaging and concurrent retries at expiry; session refresh during cooldown; and concurrent reservation of the final allowed start. The other 18 verification tests were skipped in this focused rerun; their prior results are recorded in the earlier report.

The isolated runner applied tracked migrations without drift and verified removal of disposable schema `hq_validation_20260928084940_31b0340b`. The change is not deployed. It requires an API deployment, with no database migration or mobile binary update.
