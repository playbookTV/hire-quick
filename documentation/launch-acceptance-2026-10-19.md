# Launch acceptance — 19 October 2026

## Observed this session

- Public API `/health` and `/ready` each returned HTTP 200. These are availability checks, not financial or device acceptance.
- Authenticated Expo build listing returned FINISHED for iOS preview 14 (`65b5f209-bb3e-44ca-a5d3-d151af565468`) and Android preview 24 (`3ed8c3d3-301b-4edd-9435-a2981562f28d`), from revision `80c2bb0bf1c5e346e8f51b02ae719bd76178146b`.
- Linear OVA-166 and OVA-114 remain In Progress. Their latest recorded updates are 27 and 24 September respectively; no provider approval is inferred.
- Android device tooling is absent from PATH. `xcrun devicectl` and `xcrun simctl` are unavailable. Physical-device checks require the owner's phone; no device pass is claimed.

## Device run sheet

Use [Android preview 24](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/3ed8c3d3-301b-4edd-9435-a2981562f28d) or [iOS preview 14](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/65b5f209-bb3e-44ca-a5d3-d151af565468). The iOS build requires a registered device. These preview builds target the deployed Railway API; use owner-controlled accounts. Record phone model, OS, installed build, account role, time, expected/actual behavior and a sanitized evidence reference for each case. Keep identity numbers, OTPs, tokens and business documents out of repository evidence.

All cases below are **NOT RUN** until device evidence is supplied.

| Case | Steps and expected result |
| --- | --- |
| Installation and session | Install/update; open; sign in; background and restart. Screens load and the session behaves consistently. Enter OTP only in the app. |
| Client identity | With an eligible owner-controlled client, enter capture, exercise camera permission denial/retry and submit. Submission alone must not label identity verified; record authoritative outcome and whether hiring access follows it. |
| Business review | With a real authorized business representative, submit the required registry/authority evidence and complete admin review. Record pending and final states without storing private documents in this report. |
| Photo upload | On client and worker accounts, select/capture a photo, deny/regrant permission, cancel, upload, restart and confirm persistence. Interrupt connectivity and confirm a usable retry without losing the prior saved photo. |
| Job sharing | Share an eligible job using the native sheet; cancel once and complete once. Shared text must omit the precise venue. |
| Job links | Open the shared link while signed in, then after force-closing the app. Repeat signed out and complete sign-in/profile or verification as required. The intended job should resume; record unavailable-job behavior. Links require an installed app. |
| Hiring selection | Select multiple workers, remove one, create/select an event and check that the intended selection survives navigation. Coordinate invitations with owner-controlled recipients. |
| Accessibility | Enable VoiceOver/TalkBack; navigate sign-in, verification, upload, job details and report form. Check labels, focus order, error announcements, keyboard access and enlarged text. |

Begin with installation/session and photo upload. Run identity/business submissions with the legitimate account owner present. Record defects individually with reproducible steps before modifying code.

## Remaining work and closure evidence

| Work | Next concrete step | Closure evidence |
| --- | --- | --- |
| Device acceptance | Owner confirms phone/build; execute the run sheet | Per-platform results and defect retests |
| Paystack account permission (OVA-166) | Obtain account-specific entity, held-balance, Manual Payouts, funding, fee and limit evidence | Provider/account evidence and named finance owner; see [decision register](payments/paystack-account-decisions.md) |
| Provider certification (OVA-114) | Inspect the existing retained TEST session before resuming its original references | Terminal refund/sweep, balance reconciliation and remaining adverse-state matrix; see [session runbook](payments/provider-session-runbook.md) |
| Backup and restoration | Identify database provider/project, backup retention, RPO/RTO and an isolated restore destination | Successful restore with migration, audit and financial consistency checks; restored workers disabled until external movements are reconciled |
| Historical audit recovery | Inspect historical backups/branches in isolated storage | Hash-matching originals and predecessor evidence; preserve current history; see [investigation](audit-chain-investigation-2026-09-29.md) |
| Source reconciliation | Compare dirty workspace with the frozen deployed revision before preparing commits | Reviewed source diff, appropriate validation and traceable release commit |
| Public distribution | After device acceptance, confirm store ownership, listing material and distribution targets | Accepted store binaries/listings and installation verification |

No payment, identity submission, production-data export, database restoration, audit-history correction or store submission was performed in this session. Backup provider access, restoration scope and legitimate device test accounts remain prerequisites for their respective checks.
