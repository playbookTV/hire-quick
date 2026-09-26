# HireQuick technical interface audit — 26 September 2026

## Anti-patterns verdict

**Pass for the rendered marketing page; provisional pass for the inspected product code.** The website has a coherent people-first direction, a real wordmark, distinct display/body typography, and useful organiser/staff paths. It does not read as a generic gradient-and-glass template.

The admin source is more conventional: system typography, repeated stat cards, and rounded monitoring panels with shadows. Those are mild template cues, not evidence that an operational dashboard needs a redesign. The existing product direction is explicitly approved. No aesthetic P3 tickets are added just to replace it.

This is a technical audit, not an assertion about how the interfaces were authored. Native mobile screens and authenticated admin screens were not visually re-tested.

## Executive summary

**Audit health: 13/20 — Acceptable (significant work needed).**

**7 open findings: P0 0 · P1 3 · P2 4 · P3 0.** Fix the bank picker's accessibility and error recovery, then the account selector's dark-theme contrast. Follow with consistent touch targets, motion preferences, admin tokens, and responsive website images.

| # | Dimension | Score / 4 | Key finding |
|---|---|---:|---|
| 1 | Accessibility | 2 | Bank-picker controls lack names/roles/states; account checkmark is 1.90:1 in dark mode. |
| 2 | Performance | 3 | Lean web bundles and virtualized discovery; website serves full-size JPEGs at every width. |
| 3 | Responsive design | 3 | Website reflows at four tested widths; secondary targets miss the project's 44px baseline. |
| 4 | Theming | 2 | Mobile and website tokens exist; admin colors remain literal, and an inverse-text alias is misused. |
| 5 | Anti-patterns | 3 | Intentional marketing presentation; conventional admin patterns and uneven component adoption remain. |
| **Total** | | **13/20** | **Acceptable — significant work needed** |

Scores are directional for the inspected scope, not WCAG certification or a production performance benchmark. They combine the three surfaces rather than certifying every route.

## Scope and verification

- Reviewed shared mobile controls and their relevant consumers, including withdrawal, ID verification, event forms, discovery, navigation, and theme wiring.
- Reviewed admin routing, shared page/table/review controls, login, and global styling.
- Reviewed the marketing page, all stylesheet breakpoints, tokens, image assets, and font loading.
- Inspected the actual marketing website in the browser. At **320, 390, 768, and 1280 CSS pixels**, document width equalled viewport width. Opened the mobile menu, dismissed it with Escape and confirmed focus returned to its trigger. Changed event type and observed the new selected state/content; expanded an FAQ; selected the staff audience and observed matching signup copy.
- Website production build passed: **160.28 kB JS / 51.20 kB gzip**, **20.80 kB CSS / 4.79 kB gzip**. Admin production build passed: **218.90 kB JS / 69.20 kB gzip**, **18.63 kB CSS / 4.92 kB gzip**. These exclude images/fonts and are not load-time measurements.
- Calculated contrast directly from current theme values using WCAG relative luminance. No screenshot color sampling was used.
- Final mobile TypeScript check passed. An earlier run caught a transient invalid Banner tone while concurrent edits were in progress; it was corrected in those files before the final check and is not counted as an open finding.
- No application code was changed by this audit. Other work was editing mobile files concurrently. The ID-selector state issue observed early in the review was fixed in those working files and is excluded from open findings.
- Native VoiceOver/TalkBack, OS Dynamic Type, keyboard avoidance, native reduced-motion behavior, frame rate, and authenticated admin journeys remain untested. Website text-only zoom/200% text was not tested. No claim is made that all routes meet accessibility requirements.

## Detailed findings

### 1. [P1] Bank picker omits actionable screen-reader semantics

**Location:** [BankSelectModal.tsx:55](/Users/leslieisah/app-dev/hire-quick/apps/mobile/components/BankSelectModal.tsx:55), [BankSelectModal.tsx:74](/Users/leslieisah/app-dev/hire-quick/apps/mobile/components/BankSelectModal.tsx:74).

**Category:** Accessibility.

**Evidence and impact:** The icon-only close Pressable supplies neither a role nor a meaningful accessible label. Bank rows supply an onPress handler and visible text/checkmark, but no control role or selected/checked accessibility state. A screen-reader user cannot reliably identify the close action or determine which bank is selected when configuring a withdrawal account.

**Standard:** The project's native accessibility baseline, corresponding to [WCAG 4.1.2 Name, Role, Value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html). This is a confirmed source gap; native announcement behavior has not been recorded.

**Recommendation:** Give close a button role and “Close bank picker” name. Expose each row's bank name, radio/button role, and checked/selected state. Give search a stable accessible label. Verify opening, selection, dismissal, and focus return using both native screen readers.

**Suggested command:** `/adapt`.

### 2. [P1] Account selection indicators lose contrast, especially in dark mode

**Location:** [OptionCard.tsx:79](/Users/leslieisah/app-dev/hire-quick/apps/mobile/components/OptionCard.tsx:79), [semantic.ts:51](/Users/leslieisah/app-dev/hire-quick/apps/mobile/theme/semantic.ts:51), [figma-tokens.json:115](/Users/leslieisah/app-dev/hire-quick/apps/mobile/theme/figma-tokens.json:115). Used by the withdrawal account selector.

**Category:** Accessibility / Theming.

**Evidence and impact:** The unselected ring uses borderStrong against bgSurface. The selected check uses inverseInk against brandEmerald. These aliases resolve differently across themes:

| Indicator | Light | Dark |
|---|---:|---:|
| Unselected ring against its surface | 1.75:1 | 1.62:1 |
| Selected check against its fill | 5.72:1 | **1.90:1** |

The ring and check communicate account selection. Low contrast makes that state harder to distinguish during a consequential choice.

**Standard:** [WCAG 1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), which requires 3:1 for visual information needed to identify controls/states. Decorative card borders are not automatically failures; this finding concerns the selection indicators.

**Recommendation:** Use borderControl for the radio ring; it already measures 4.55:1 light and 4.61:1 dark against bgSurface. Use a foreground/background pair explicitly designed for the selected indicator, with at least 3:1 in both themes. Do not globally change inverseInk to fix one consumer.

**Suggested command:** `/colorize`.

### 3. [P1] Failed bank loading is presented as an empty search

**Location:** [BankSelectModal.tsx:29](/Users/leslieisah/app-dev/hire-quick/apps/mobile/components/BankSelectModal.tsx:29), [BankSelectModal.tsx:62](/Users/leslieisah/app-dev/hire-quick/apps/mobile/components/BankSelectModal.tsx:62), [hooks.ts:420](/Users/leslieisah/app-dev/hire-quick/apps/mobile/lib/hooks.ts:420).

**Category:** Anti-pattern / Error recovery.

**Evidence and impact:** After an initial bank request fails without cached data, banks.data becomes an empty array. Rendering distinguishes loading from everything else, so the result is “No banks match …” with no error or retry control. The user cannot select a bank and receives the wrong explanation. Closing and reopening does not create an explicit retry path because this picker stays mounted.

**Standard:** Project design principle: distinguish unavailable data from empty results. No standalone WCAG violation is asserted.

**Recommendation:** Show an explicit bank-loading error with a refetch action. Keep genuine no-match results separate. If cached banks exist after a refresh failure, preserve them with an appropriate stale-data notice.

**Suggested command:** `/harden`. Validate initial failure, successful retry, stale-cache failure, and genuine unmatched search.

### 4. [P2] Secondary controls fall below the 44px target baseline

**Location:** [BankSelectModal.tsx:55](/Users/leslieisah/app-dev/hire-quick/apps/mobile/components/BankSelectModal.tsx:55), [styles.css:1267](/Users/leslieisah/app-dev/hire-quick/apps/website/src/styles.css:1267), [styles.css:203](/Users/leslieisah/app-dev/hire-quick/apps/website/src/styles.css:203).

**Category:** Responsive design / Accessibility.

**Evidence and impact:** At 320px, the four event-strip links measured **37.45px high**, and the website's header/footer home links measured **33px / 32px high**. The native bank-picker close action uses a 22px icon plus 8px hitSlop, without a 44px minimum control box. Small secondary targets increase mistaps and make one-handed use harder.

**Standard:** Project 44×44 target requirement. [WCAG 2.5.5 Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html) is AAA; these measurements alone do **not** establish an AA failure.

**Recommendation:** Add 44px minimum interactive boxes with suitable centering/padding while retaining the current visual icon/text sizes. Confirm native hit areas and neighboring target separation on device.

**Suggested command:** `/adapt`.

### 5. [P2] Native picker transitions bypass the shared motion preference

**Location:** [Select.tsx:69](/Users/leslieisah/app-dev/hire-quick/apps/mobile/components/Select.tsx:69), [BankSelectModal.tsx:36](/Users/leslieisah/app-dev/hire-quick/apps/mobile/components/BankSelectModal.tsx:36).

**Category:** Accessibility / Motion consistency.

**Evidence and impact:** Both native Modal implementations explicitly request animationType="slide" and do not consume the live motion-preference hook already used by Pressable, Skeleton, and Toast. The application's reduced-motion behavior therefore does not consistently cover event/profile selectors and the bank picker. Native OS suppression was not tested; this is the verified implementation gap, not an observed device-level failure.

**Standard:** Project reduced-motion requirement. [React Native Modal](https://reactnative.dev/docs/modal) provides a non-animated presentation option. No WCAG AA failure is assigned solely for this transition.

**Recommendation:** Select a non-animated presentation when reduced motion is enabled, using the existing hook. Verify opening and closing after changing the preference while the app is running.

**Suggested command:** `/animate`.

### 6. [P2] Admin colors bypass semantic design tokens

**Location:** [index.css:2](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/index.css:2), [index.css:142](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/index.css:142), [index.css:469](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/index.css:469).

**Category:** Theming.

**Evidence and impact:** Backgrounds, action colors, focus outlines, control borders, and monitoring statuses are literal colors throughout the stylesheet. Shared intent such as action green (#17664d) is repeated across buttons, evidence links, stat cards, checkbox accents, and monitoring links. A contrast or brand correction requires editing multiple independent declarations, increasing the chance of inconsistent states.

**Standard:** Token consistency; no WCAG violation or missing-dark-mode defect is inferred. The admin explicitly declares a light color scheme.

**Recommendation:** Introduce admin-scoped semantic CSS variables for surface, ink, action, focus, border, and status roles. Preserve the existing palette and light appearance; route the repeated declarations through those variables.

**Suggested command:** `/polish`.

### 7. [P2] Marketing images have no responsive source variants

**Location:** [App.tsx:245](/Users/leslieisah/app-dev/hire-quick/apps/website/src/App.tsx:245), [App.tsx:348](/Users/leslieisah/app-dev/hire-quick/apps/website/src/App.tsx:348), [index.html:22](/Users/leslieisah/app-dev/hire-quick/apps/website/index.html:22).

**Category:** Performance.

**Evidence and impact:** Both displayed photographs use a single 1536×1024 JPEG without srcset/sizes or picture alternatives. The hero file is **374,984 bytes** and the secondary photo **346,882 bytes**. A narrow handset receives the same source as desktop; CSS cropping changes presentation but not the downloaded file. That is avoidable image-transfer cost on limited connections, especially for the above-the-fold image.

**Standard:** Responsive-image efficiency; no measured Core Web Vitals failure is claimed.

**Recommendation:** Generate visually checked WebP/AVIF alternatives and sizes appropriate to rendered width and device density. Add responsive source selection and align the hero preload with it to prevent redundant downloads. Retain explicit dimensions and the secondary image's existing lazy loading; keep the hero eager.

**Suggested command:** `/optimize`.

## Systemic patterns

1. **Accessible shared components are not used consistently.** Button and OptionCard expose state, but raw Pressables in the bank picker bypass that contract.
2. **Theme correctness requires checking token pairs in actual consumers.** A token appropriate for elevated dark surfaces is not automatically appropriate for a bright green selection indicator.
3. **Recovery and preference handling are uneven.** Shared query-error and motion patterns exist; the pickers need to adopt them.
4. **The admin's stylesheet centralizes rules but not semantic values.** Centralized tokens would make future contrast changes easier to verify.

## Positive findings

- Website headings, landmarks, skip link, informative image alternatives, native FAQ disclosure, pressed states, and live regions provide a strong semantic foundation.
- Website content reflowed at all four tested widths. Its mobile menu's Escape dismissal and focus return worked.
- Admin tables expose column scopes and a keyboard-focusable horizontal-scroll region. Review panels move focus on opening and restore it on closing. Login has associated labels, error/status announcements, and native validation.
- Mobile buttons use 44/52px minimum heights, wrapping labels, focus indicators, and disabled/busy semantics. The ID buttons now expose radio checked state.
- Mobile discovery uses FlashList, memoized rows, stable handlers, and debounced search; its cached-data error handling distinguishes stale results from an empty list.
- Mobile navigation adapts to font scale. Light/dark theme selection is wired at the root.
- Recent shared motion work cancels animations and responds to preference changes. Website animations use transform-based movement and its stylesheet includes a reduced-motion override.
- The mobile crash fallback deliberately avoids depending on a theme provider that may itself have failed. Its literal fallback colors are not counted as a token violation.
- No unsupported claim of a large JavaScript bundle, unused dependency, layout thrashing, or pervasive unnecessary rerendering is included. Build sizes and inspected code do not justify those claims. Missing will-change alone is not a defect.

## Anti-pattern checklist disposition

Typography, hierarchy, palette, colored-background text, cards/grids, decoration, motion, action hierarchy, repeated copy, and responsive functionality were considered against impeccable's DON'T guidance. Marketing source has no gradient text, decorative glass blur, or thick side-stripe accents. The website uses Archivo/Manrope and an intentional charcoal/yellow palette. Native hex tokens are appropriate to its renderer; imposing browser-only OKLCH syntax would not improve correctness.

Conventional admin card/shadow/system-font choices are noted above, but the approved product context takes precedence over replacing them for novelty. Monetary balance summaries and operational metrics serve real tasks. A spring-based Sparkline remains in component source; its current rendered exposure was not established, so it is not presented as a verified user-facing defect.

## Recommended actions

1. **[P1] `/harden`** — Separate failed bank loading from empty search; provide an explicit retry.
2. **[P1/P2] `/adapt`** — Repair bank-picker semantics and increase the listed secondary touch targets.
3. **[P1] `/colorize`** — Correct OptionCard indicator pairings in light and dark themes without changing the approved palette.
4. **[P2] `/animate`** — Connect both native picker presentations to the shared reduced-motion preference.
5. **[P2] `/optimize`** — Add responsive photograph variants and matching hero preload behavior.
6. **[P2] `/polish`** — Consolidate admin color tokens, then verify focus, wrapping, target sizes, and theme consistency after the preceding fixes.

You can ask me to run these one at a time, all at once, or in any order you prefer.

Re-run `/audit` after fixes to see your score improve.

## Evidence limits and graph provenance

Used Verify (Tier 2) evidence: graph-first symbol discovery, relevant caller/callee traces, exact source inspection, and direct contrast/build/browser checks. This is a broad sampled audit, not exhaustive graph Auditor-tier coverage of every route.

Graph project: Users-leslieisah-app-dev-hire-quick. Main coverage generation: 2026-09-26T09:20:52Z; additional coverage generation: 2026-09-26T09:23:56Z. Relevant paginated symbol queries and traces completed without remaining pages. Recorded parse gaps at website App.tsx:577 and admin Observability.tsx:172 were read directly. Coverage metadata is best effort and does not prove completeness. Cited defect source was re-read during report preparation because other work was changing files.
