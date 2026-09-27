# HireQuick deterministic design scan

Date: 2026-09-16

- Detector: Impeccable npm package 4.1.0; platform CLI package 0.1.5. This version advertises 61 deterministic rules (the installed critique skill describes an older 25-rule version).
- Scan targets: `apps/admin/src` and `apps/mobile`.
- Commands: `impeccable detect --json TARGET`, repeated with `--no-config` to eliminate project/inline ignores.
- Result: both targets returned `[]`, exit 0, no stderr diagnostics. Zero reported findings; zero false positives to adjudicate.
- Control: temporary HTML containing gradient text and a colored side border produced three findings (one side-tab and two gradient-text entries), exit 2. The detector executes successfully.
- Limitations: static regex-based scans for non-HTML source; no rendered-page overlay, keyboard interaction, screen-reader, contrast, performance, responsive layout, or native-device certification. React Native style objects and runtime semantics require source and native testing independently. A zero finding count should not be described as an audit pass.
- Initial sandboxed npm requests failed with ENOTFOUND. An approved escalated fetch into this temporary directory succeeded; no repository package/dependency changes were made.
- `pnpm --filter @hq/admin typecheck`: PASS (exit 0).
- `pnpm --filter @hq/mobile typecheck`: PASS (exit 0).
- Temporary scanner positive control lives outside the repository; it is not an application issue.
