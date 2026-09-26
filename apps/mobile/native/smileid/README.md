# Smile ID with HireQuick-owned Sentry

This local Swift package uses the unmodified Smile ID 12.1.0 Bridge and Vision
Face binaries and checksums from the [upstream manifest](https://github.com/smileidentity/ios-spm/blob/v12.1.0/Package.swift).
It retains Kamera 1.0.5 and the source target that makes Xcode embed the camera
framework. It omits only the optional `UseSmileIDSentrySupport` adapter and its
second Sentry dependency. The upstream adapter is discovered dynamically;
the verification binaries do not link Sentry themselves.

`@sentry/react-native` provides HireQuick's native Sentry SDK through CocoaPods.
Linking that alongside Smile ID's SwiftPM Sentry copy caused duplicate symbols
in iOS preview build 4. `plugins/with-smileid-host-sentry.js` replaces Smile ID's
package references in the app and Pods projects at the end of `pod install`.
The published verification binaries remain unchanged.

`SmileCapture.native.tsx` sets the documented `enableCrashReporting = false`
option because HireQuick owns crash reporting and its privacy filter. This
also disables Smile ID's separate handled-error reporting on Android.

When upgrading Smile ID, review the upstream products, binary checksums and
Kamera version together. If adding another Smile ID native product, add its
verified binary and dependencies here before building. Native compilation and
an on-device verification flow must be checked after such changes.
