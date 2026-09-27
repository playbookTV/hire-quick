# Technical UI audit fixes — 26 September 2026

All seven findings from the [technical interface audit](technical-ui-audit-2026-09-26.md) have implementation fixes. Browser and source validation passed within the scope below; native assistive-technology verification remains outstanding. The original audit score is a historical baseline, not a new certification.

## Changes

| Finding | Implementation | Evidence |
| --- | --- | --- |
| 1. Bank-picker semantics | Named close/search controls, heading role, named radio rows with checked state, modal accessibility boundary and escape handler. | Names and roles inspected in a browser fixture rendering the real components. Native checked-state announcements need device verification; the React Native Web adapter did not expose `accessibilityState.checked` as `aria-checked`. |
| 2. Account-selector contrast | Uses `borderControl`, `selectionFill`, and `inkOnSelection` in both themes. | Calculated ring contrast: light **4.55:1**, dark **4.61:1**. Check/fill contrast: light **6.40:1**, dark **7.33:1**. |
| 3. Bank-load recovery | Distinct loading, failed request, stale cached data, empty response, and search-empty states. Retry/refresh and clear-search actions; cached results remain selectable. | Reproduced the original failed-request state showing “No banks match”; after the fix, retry produced the list and selection closed the sheet. Also exercised cached-error, empty, loading and search recovery states. |
| 4. Touch targets | Bank close control has a 44×44 minimum; website wordmarks and event links have a 44px minimum height. | Browser measurements confirm the bank close target is 44×44 and website targets meet 44px at all four tested widths. |
| 5. Reduced motion | Both `Select` and `BankSelectModal` use the existing live motion-preference hook; reduced motion selects `animationType="none"`. | Source/type checks and opening/selecting with a simulated preference change in the fixture. Native OS animation behavior remains untested. |
| 6. Admin theming | Centralized existing colors in `apps/admin/src/tokens.css`, consumed through semantic variables. | Parsed stylesheet comparison: all **72** variable usages resolve to the original colors; selectors, declaration values and rule order match after formatting normalization. Login appearance and focus outline inspected in the browser. |
| 7. Website images | Added 640/960/1536px WebP sources for both photographs, retaining JPEG fallbacks. Hero preload matches its responsive source; secondary image remains lazy. | Browser selected 640px sources at 320/390px viewports and 960px sources at 768/1280px viewports (observed browser density). Mobile and desktop crops inspected. |

The bank-picker header and states are inside its scrollable list so larger text can reach all controls and results. At a 320×760 viewport with doubled theme typography, the list had a 596px visible area and 836px content; the long-name bank remained selectable, with no document overflow. This simulates enlarged text and is not an OS Dynamic Type test.

## Image payloads

Original photographs are unchanged. WebP variants were encoded at quality 82 with effort 6 and no upscaling.

| Photograph | Original JPEG | 640px WebP | 960px WebP | 1536px WebP |
| --- | ---: | ---: | ---: | ---: |
| Event crew | 374,984 bytes | 37,408 bytes | 59,640 bytes | 102,312 bytes |
| Event welcome | 346,882 bytes | 35,002 bytes | 57,970 bytes | 101,910 bytes |

The combined payload is **90.0% smaller** for the 640px pair, **83.7% smaller** for the 960px pair, and **71.7% smaller** for the full-width pair. These are file-size reductions, not measured loading-time gains. Source `sizes` account for the full image width needed by the tall `object-fit: cover` crop. Keep hero source and preload sizes aligned if the layout changes.

## Validation

- Mobile TypeScript check passed; focused ESLint passed for all four changed mobile files.
- Website production build and package lint passed.
- Admin production build and package lint passed.
- `git diff --check` passed.
- Website document width matched viewport width at **320, 390, 768, and 1280 CSS pixels**. Opened mobile navigation and followed “Our world”; verified navigation closed and the destination rendered.
- A temporary browser fixture rendered the actual bank picker, account options and shared selector, using controlled query states rather than real bank requests. Retry was invoked once, the successful response appeared, clear-search restored options, and selecting a bank/date updated the fixture. Light and dark themes were inspected; dark theme, doubled typography, and a live simulated reduced-motion setting were exercised together.
- Reviewed existing consumers, hook behavior, theme aliases, CSS breakpoints, and graph coverage before editing. The graph's website parse gap was checked directly in source.

## Limits

VoiceOver/TalkBack announcements, native focus behavior, OS Dynamic Type, native keyboard avoidance, and real-device reduced motion require an iOS/Android device pass. Authenticated admin journeys and real withdrawal/provider flows were not exercised for these presentation changes. No overall accessibility certification or new audit score is claimed.

Unrelated concurrent changes in the workspace were left intact.
