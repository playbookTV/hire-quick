# Media upload performance — 29 September 2026

Status: implementation and regression validation complete. These performance changes have not been deployed or included in new mobile builds.

## Evidence and scope

After the [MIME correction release](deployment-media-upload-2026-09-28.md), the owner confirmed uploads worked but reported slow completion. Recent successful API requests showed approximately 2.1–2.3 seconds for photo upload URL issuance and 2.7–2.9 seconds for finalization. These are separate HTTP request durations, excluding file transfer and the later profile/message attachment. They do not establish an end-to-end device time.

Source inspection found redundant work in three shared paths:

- Mobile file response → native Blob → upload byte buffer. Installed Expo source documents the native Blob/base64 round trip; its request normalizer accepts an ArrayBuffer without this conversion or a MIME-header override.
- Account row lock followed by a second query for the same row's status.
- Storage HEAD followed by a ranged GET, although a ranged GET returns the version, content type and total size alongside the prefix.

Graph coverage was checked for the uploader, storage adapter, account lock, tests and affected guide. There were no recorded gaps and metadata matched at inspection; this is best-effort coverage. Installed dependency source was inspected directly because it is excluded from the graph.

## Changes and safeguards

The mobile uploader now reads one ArrayBuffer and reuses it for PUT, keeping the signed MIME header and actual byte count. File-size limits, the shared abort deadline, PUT failure behavior and mandatory finalization remain. The Expo normalization regression verifies that a 1 MiB file retains the same underlying buffer without a Blob conversion. Existing cases cover empty/mismatched local MIME types; additional cases reject empty and oversized actual files before signing.

`lockUploadOwner` selects status under the same `FOR UPDATE` lock in one query. This saves one database round trip per invocation, including issuance, finalization and attachment callers. The transaction boundaries and owner/object lock ordering are unchanged. Missing, suspended and anonymized owners remain rejected.

Storage inspection uses one GET capped at bytes 0–511. It requires HTTP 206, a valid range starting at zero, a safe positive total size, the expected prefix length, matching Content-Length, and an ETag. Inconsistent metadata is rejected before consuming the body. The conditional copy still requires the inspected ETag, so replacing the staging object invalidates the copy. Provider deadline and retry limits are unchanged.

The picker already uses quality 0.8 but has no dimension cap. This change preserves image/document content and dimensions; compression, portfolio concurrency and hosting-region changes are outside this measured change.

## Live storage comparison

A synthetic 1 KiB fixture was uploaded to the configured R2 bucket. Three sequential pairs compared the previous HEAD + GET path with the new GET path from the developer machine:

| Sample | Previous inspection | New inspection |
| --- | ---: | ---: |
| 1 | 600 ms | 312 ms |
| 2 | 338 ms | 159 ms |
| 3 | 365 ms | 176 ms |

Median: 365 ms → 176 ms. This is a small, fixed-order component comparison, not a benchmark from the deployed API or either mobile platform. It does not imply the whole upload is twice as fast. Both versions transfer at most 512 prefix bytes.

The live check also verified successful conditional copy and rejection with HTTP 412 after the source was replaced. Both synthetic objects were deleted successfully. No customer files were read or modified.

A read-only deployed database latency probe could not run because Railway SSH lacked a usable trusted-host setup. No database-region conclusion or hosting change is made from this attempt.

## Validation

- Mobile: 60 tests across seven files pass, including seven upload transport cases.
- Workspace typecheck and lint pass (existing unrelated lint warnings remain).
- Test source typecheck and lint pass; the mobile uploader/test also pass explicit lint with `--no-ignore`.
- Live R2 inspection, conditional copy, stale-version rejection and synthetic cleanup pass.
- Database-backed upload/chat regressions and adapter regressions: all 53 tests across six files pass. The isolated runner applied tracked migrations, confirmed no schema drift, and removed its disposable schema after validation. The six suites cover uploads/cleanup, chat media, provider deadlines/ranges, mobile transport failure/timeout behavior, format signatures and R2 copy addressing.
- Documentation link checks and diff whitespace checks pass.

## Release and acceptance

No schema or native dependency changes are required. The server changes need an API release; the mobile buffer change needs a client release. On-device end-to-end timing on iOS and Android remains outstanding. Measure the same photo/network before and after release, including finalization and attachment, before making a total upload-speed claim.

Rollback should restore the prior server implementation and the released MIME-tagged Blob uploader, not the earlier uploader that omitted the Blob type.
