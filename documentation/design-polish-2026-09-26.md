# Mobile refinement — 26 September 2026

Applied the requested delight, polish, better-ui, Emil design engineering, transitions-dev, better-colors, and better-typography guidance, using the existing Impeccable context and Expo implementation conventions. The goal is refinement of the approved design: no screen restructuring, font replacement, palette rewrite, new decorative assets, or changes to account/payment flows.

The CSS-specific guidance was assessed for the native app. Motion is implemented with the existing Reanimated dependency and native tokens; no CSS transition library or second styling system was installed in the app. Figma's visual token snapshot remains unchanged.

## Interaction and motion

| Before | After | Why |
| --- | --- | --- |
| `components/Pressable.tsx`: spring to `0.97`; `Button.tsx` opted out of scaling | Shared `0.96` press scale, 100 ms press and 150 ms release, using the tokenized ease-out curve; Button uses this feedback | Small, immediate tactile feedback with no spring overshoot |
| Pressable had no explicit static prop or keyboard-motion distinction | `static` opt-out; keyboard presses retain existing feedback without initiating scale; existing fixed chips/navigation retain `scaleTo={1}` | Avoid repeated motion on frequent controls |
| Press scale could remain active while disabled or motion preference changed | Cancel and restore scale to `1`; cancel animation on cleanup | Keep the control in its proper resting state |
| Motion relied on library defaults/startup preference | `lib/use-motion-preference.ts` reads the current preference and subscribes to changes; all changed motion uses this live preference | Respect changes while the app is open, including enabling motion again |
| `components/Toast.tsx`: spring slide entrance and 200 ms slide exit | Fade in over 250 ms and out over 150 ms; immediate presentation/dismissal when reduced motion is enabled | Quiet confirmation with a quick exit; supported by the native and web renderers |
| `components/Skeleton.tsx`: infinite pulse without effect cleanup | Preserve its 800 ms half-cycle, stop/cancel on cleanup, and use steady 0.75 opacity under reduced motion | Avoid unnecessary movement and orphaned animation work |
| Skeleton blocks could be exposed as decorative accessibility elements | Hide placeholder blocks from the accessibility tree | Keep assistive navigation focused on meaningful content |
| `lib/toast.tsx`: auto-dismiss timer survived provider unmount | Clear the timer on unmount | Avoid callbacks after leaving the provider |
| Interaction constants scattered through components | Shared `motionTokens` in `theme/token-manager.ts`, including press, toast, skeleton, and easing roles | Keep subsequent refinements consistent |

## Typography

| Before | After | Why |
| --- | --- | --- |
| `theme/token-manager.ts`: amounts and verification codes inherited proportional numerals | Native `fontVariant: ['tabular-nums']` applied to Amount and Code styles | Keep changing digits aligned without changing font, size, or color |
| `components/Stepper.tsx`: proportional counter | Uses the same `numericTypography` token | Stable changing counts |
| Toast title: local 13 px / 18 px style | Existing Restyle `label` variant (14 px / 20 px) | Use the approved UI type scale |
| Toast message: local 13 px / 18 px style | Existing Restyle `bodySm` variant (14 px / 20 px) | More readable notifications with the existing font family |

## Spacing and focus

| Before | After | Why |
| --- | --- | --- |
| `Input.tsx`: focus/error border grew from 1.5 to 2 px while padding stayed fixed | Shared border tokens; subtract the extra border inset from horizontal/vertical padding | Keep the field's content box steady during focus and validation |
| `TextArea.tsx`: same border/padding shift, plus an additional browser outline | Compensated token padding and only the existing semantic focus border | Match single-line input focus behavior |
| Toast had local 14 px padding and literal positioning/gaps | 16 px token padding, tokenized 12 px gap and existing 8/16 px offsets, explicit 44 px minimum target | Fit the spacing system and retain a comfortable dismiss target |
| Tappable toast announced itself as an alert but did not expose its dismiss action or focus state | Button semantics, dismiss hint, per-toast keyboard focus ring; the provider's existing announcement remains | Make dismissal discoverable without changing notification content |
| Toast used the deprecated `pointerEvents` prop | Same `box-none` behavior through its style | Preserve pass-through behavior using the supported styling API |

## Color review

No colors were changed. The 20 sampled semantic foreground/background pairs meet the project's WCAG AA normal-text threshold, with ratios from 5.19:1 to 9.60:1. This is a bounded token-pair check, not a whole-app conformance claim.

APCA readings are also recorded in `validation-evidence/2026-09-26/design-polish/contrast.json`. Some pairs fall below the skill's simplified APCA advisory targets, including default accent buttons (Lc 43.8) and several dark-theme pairs. The approved palette was preserved as requested; this pass does not claim universal APCA compliance. Hex colors remain the native renderer's existing representation; no browser-only OKLCH values were inserted into React Native styles.

## Verification and delivery

- Mobile TypeScript validation passes.
- Targeted lint for changed mobile files passes. Full mobile lint reports no errors and two existing filesystem warnings in `plugins/with-smileid-host-sentry.js`.
- Android and iOS Hermes JavaScript exports pass; these are bundle checks, not new signed APK/IPA builds.
- Interacted with the actual shared components in a temporary React Native Web preview using locally bundled fonts: typed into fields, changed counts, selected chips, observed loading feedback, showed success/error notifications, and dismissed notifications.
- Visually reviewed 390 px light and 320 px dark presentations. At 320 px with simulated 200% text, controls expand/wrap; long amounts wrap rather than disappear.
- Exercised reduced-motion changes through a fixture for the OS accessibility event, including toggling it back off. This is not physical-device accessibility or frame-rate verification.
- The web preview retained an existing shadow-property deprecation warning. No claim is made that every screen or every native interaction has been exercised.
- No production API, Figma document, store submission, or installable build was modified by this pass.
