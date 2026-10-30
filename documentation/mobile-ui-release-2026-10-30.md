# Mobile UI release — 30 October 2026

The owner requested all remaining work committed, a pull request, Android/iOS Expo builds, and TestFlight submission. [PR #5](https://github.com/playbookTV/hire-quick/pull/5) targets `main` from `playbooktv/mobile-app-ui-designs`.

## Source

Native release commit: `cb31648be7038a9ac04abb803d38877b9022d483`.

- `0181a33` merges the weekly-payout branch history into the mobile UI branch.
- `61429dd` restores the saved push-registration repairs, including hourly foreground refresh and recovery after delayed native token deletion.
- `cb31648` integrates the remaining mobile designs: branded splash, shared components, account/profile screens, availability calendar, and inbox search/unread filters. The integration preserves weekly-payout labels and withdrawal gating, notification settings, client verification details, and expanded profile fields.
- `6755c24` updates two pre-existing backend test fixtures to use verified individual clients. This commit changes tests only; the native app source remains identical to `cb31648`.

Both native builds were uploaded from a temporary clean checkout of the exact release commit. The original UI checkout remains intact as a backup. This mobile release does not deploy the API, worker, admin console, or production migrations.

## Validation

- Repository typechecks, lint, test typechecks, test lint, and documentation checks passed. Lint retains existing warnings in the environment validator and native Sentry plugin.
- Shared: 97 tests passed. Admin: 14 tests passed. Mobile: 156 tests passed, including five design interaction tests and the push-repair regressions.
- iOS and Android Expo bundle exports passed.
- The [first GitHub CI run](https://github.com/playbookTV/hire-quick/actions/runs/40986328903) passed static checks, disposable-database migrations, and the drift guard, but reproduced the two backend test failures documented in the previous release: booking-history scoping and REST/socket message validation. Their fixtures lacked the client verification state required by these scenarios. `6755c24` supplies that state without changing runtime authorization or weakening assertions. The [second CI run](https://github.com/playbookTV/hire-quick/actions/runs/40986895586) passed, including the API suite and isolated payment lifecycle check.
- Physical-device acceptance has not been performed in this chat.

## Native builds and submission

| Platform | Profile | Version | Build | Result |
| --- | --- | --- | --- | --- |
| Android | `preview`, internal APK | 0.0.1 (29) | [a31eb376](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/a31eb376-05ad-4e96-aa45-d5e16b299303) | Finished 02:03:44 UTC; [download APK](https://expo.dev/artifacts/eas/dqjNbI3F-HkTg0HM9sXmEoPr3Gf2lhncGZJ_kh_Y0VY.apk) |
| iOS | `ios-archive`, store archive | 0.0.1 (20) | [3e9343e1](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/3e9343e1-8e47-4ae0-a09c-a524011204c8) | Finished 01:40:59 UTC; submitted 01:41:14 UTC |

The iOS submission targets App Store Connect app `6826389013` using the existing EAS-held API key. [Submission 5f888b99](https://expo.dev/accounts/ovalay-studios/projects/hirequick/submissions/5f888b99-fcb1-484c-9a48-8f82b68feb97) finished successfully at 01:41:14 UTC. The first auto-submission attempt was rejected because custom release notes require an Enterprise EAS plan; scheduling the same build without that optional field succeeded. No duplicate iOS build was started.

Both profiles retain the configured API URL `https://prolific-love-production-2775.up.railway.app` and EAS `preview` environment. The Android build still has no Firebase `GOOGLE_SERVICES_JSON` configuration, as in the [previous release](deployment-2026-10-27.md#mobile-builds), so Android push registration remains unavailable until that configuration is supplied in a new build. The push fixes do not provision provider credentials.

At 01:46 UTC, App Store Connect reported build 20 as `VALID` and `IN_BETA_TESTING` for internal testers. External testing is `READY_FOR_BETA_SUBMISSION`; no external beta review or public App Store release was requested or initiated.
