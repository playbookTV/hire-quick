# Media upload MIME mismatch — 28 September 2026

**Status:** ROOT CAUSE ESTABLISHED; correction verified locally, not released.
**Impact:** The user reports all media uploads failing on Android and iOS with “upload failed”.
**Environment:** Repository Expo SDK 57, installed Expo 57.0.24; the user's installed build numbers were not confirmed.

## Reproduction and mechanism

The shared mobile transfer reads a local file with `fetch(uri).blob()`, requests a URL signed for the selected MIME type and exact byte size, PUTs the Blob, then finalizes the upload. The API explicitly signs `content-type`.

Expo 57 installs its fetch implementation globally unless `EXPO_PUBLIC_USE_RN_FETCH` is enabled. Its local file responses can have no content-type header: iOS returns an empty header list for non-HTTP responses, and Android's file interceptor creates a response without copying the body's MIME type to its headers. `FetchResponse.blob()` therefore produces a Blob with an empty type. Expo's `normalizeBodyInitAsync` then overrides the explicitly supplied PUT Content-Type with that empty Blob type. The outgoing request no longer matches the signed header and the storage rejection becomes “Upload failed. Please try again.”

Evidence was read directly from the installed Expo source (`winter/runtime.native.ts`, `winter/fetch/FetchResponse.ts`, `winter/fetch/RequestUtils.ts`, `ios/Fetch/NativeResponse.swift`, and Android `OkHttpFileUrlInterceptor.kt`/`NativeResponse.kt`). Dependency files are excluded from the knowledge graph; they were inspected on disk. Application graph coverage was checked for the uploader and storage paths.

The new mobile regression imports the installed SDK's actual normalization functions. A storage-boundary fixture accepts only the signed Content-Type. Before correction, the empty-type, generic binary-type and mismatched image-type cases all fail with the reported message; the matching image-type control passes. This is a deterministic local contract reproduction, not a live R2/device test.

## Alternatives and limits

- Browser CORS does not explain native failures on both platforms.
- The reproduced error is raised at the rejected PUT stage, before finalization. Authentication, signing and content-verification failures have separate error paths.
- Sentry returned no recent mobile issues or matching upload spans. That absence does not prove those requests succeeded.
- Railway CLI and browser access were unavailable because of network/DNS failures. Current provider credentials, running-service logs and installed-device behavior could not be verified.

## Correction

`apps/mobile/lib/upload-transfer.ts` sends a full Blob slice with the MIME type used to sign the URL. React Native implements this slice as a view of the same bytes. File bytes, byte count, timeout, server-side MIME/signature screening, and finalization requirements are preserved. The shared fix covers profile/portfolio photos, manual verification documents and chat images.

No server configuration, native dependency or database change is required. Reverting this one uploader change is the code rollback. Installed clients need a release containing the corrected JavaScript.

## Verification

- Before: three failing regression cases and one passing control.
- After: all four regression cases pass, with exact byte preservation and finalization assertions.
- Entire mobile test suite: 57 tests across seven files pass.
- Mobile TypeScript check passes.
- Targeted uploader/test lint and documentation links pass. The test was explicitly linted with `--no-ignore` because the standard mobile lint configuration excludes tests.

## Release acceptance

On both platforms, upload a library photo and a camera photo, then verify the saved profile/portfolio image and a booking chat image. Confirm PUT success followed by successful finalization and attachment. A continued “Upload failed” should trigger inspection of the storage response status and signed-header agreement, without logging signed URLs or file contents. Real-device acceptance and release remain outstanding.
