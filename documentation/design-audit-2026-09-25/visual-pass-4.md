# HireQuick product adaptation — pass 4
25 September 2026

Marketing and prototype wiring were explicitly deferred. Changes were made directly in Figma; no application code was changed.

## Completed

**P4.a — Adaptive controls**
- All 40 Button variants retain their 44/52px minimum heights and grow when labels wrap. The label, intent and interaction-state properties are preserved.
- Added CodeInput with Default, Focus, Error, Filled and Disabled states. It represents one six-digit field rather than six separate focus targets. Applied it to seven authentication/check-in states, including incorrect, expired, unavailable and offline states.
- Incomplete default authentication and check-in examples show disabled submission. Resend in the incorrect-code example is a proper button.
- Component descriptions specify numeric input, leading-zero preservation, paste/autofill and error association.

**P4.b — Product form and wallet adaptation**
- Account: compact keyboard-space OTP and identity screens; 200% text OTP and identity screens.
- Shared: compact keyboard-space check-in, dispute and withdrawal; enlarged check-in and dispute; compact and enlarged checkout.
- Usher: enlarged wallet plus expanded navigation.
- Identity consent and provider explanation reflow within the scrollable content. Focused inputs and actions remain clear of the modeled keyboard.
- At enlarged wallet sizes, currency is identified by NGN in the balance label while the complete number remains at 80px. Amounts are not split across digit groups.
- Wallet history actions have proper button targets. Held-funds copy explicitly bases the 72-hour deadline on scheduled event end.

**P4.c — Narrower admin**
- Disputes at 1024px retain evidence and decision side by side.
- At 768px and 320px, evidence and decision stack and the main content scrolls.
- Approval tables become readable request cards at 768px and 320px; action, amount, requester, reason, status and review access remain available.
- Added ApprovalRequest with Inline/Stacked layouts.
- Added stacked MoneyStateRow layouts: six tone/layout combinations in total.

**P4.d — Verification and corrections**
- 140 active text/theme comparisons passed the conservative 4.5:1 benchmark. Minimum 5.539:1.
- 18 focus-ring comparisons passed 3:1. Minimum 3.298:1.
- 12 control-boundary comparisons across default, focus and error colors against both surfaces/themes passed 3:1. Minimum 3.298:1.
- Disabled variants were excluded from contrast requirements.
- Post-fix scan of 3,383 visible, nonempty text nodes across Account, Client, Usher, Shared and Admin found zero remaining unscrollable clipping candidates. Marketing and Prototypes were excluded.
- All five keyboard-space specimens place the footer/action above the modeled keyboard.
- Visual review caught and corrected clipped focus outlines, an identity provider explanation, the narrow admin subtitle, a fixed-height dispute container, and broken currency groups in the enlarged wallet/checkout.
- The final Shared-page QA check found no standalone currency amount wrapping across lines.
- Temporary visual-proof clones were removed after screenshots.

The file now has 39 component families (19 sets, 20 standalone), 97 variables and 17 text styles. This pass added 18 screen QA specimens. Overall screen inventory: 159 product/annotation frames plus 21 screen QA frames; Foundations has two additional component QA specimens.

## Open the work

| Area | Figma |
|---|---|
| OTP with keyboard space | [Compact OTP](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=2085-680) |
| Identity with keyboard space | [Compact identity](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=2085-773) |
| Identity at 200% text | [Enlarged identity](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=2085-831) |
| Check-in with keyboard space | [Compact check-in](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=2086-1459) |
| Dispute with keyboard space | [Compact dispute entry](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=2086-1550) |
| Checkout at 200% text | [Enlarged checkout](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=2086-1727) |
| Withdrawal with keyboard space | [Compact withdrawal](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=2086-1801) |
| Wallet at 200% text | [Enlarged wallet](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=2088-1746) |
| Expanded wallet navigation | [All sections](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=2088-1853) |
| Admin at 1024px | [Side-by-side dispute review](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=2092-484) |
| Admin at 320px | [Stacked dispute review](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=2093-796) |
| Approval cards at 320px | [Narrow approvals](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=2093-908) |
| Code field component | [CodeInput states](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=2084-408) |
| Approval card component | [ApprovalRequest layouts](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=2094-399) |

## Implementation handoff and limits

These are visual specifications and static checks, not a WCAG conformance certificate. The keyboard blocks reserve 260px to test obstruction; they are not native keyboard captures or a universal keyboard height. The actual app must respond to measured keyboard insets, keep the focused control visible, allow scrolling to all form content, and avoid double-counting safe areas.

At large text, action containers must grow. Secondary explanatory content can move into the scroll region while the primary action remains reachable. Do not reduce the user's chosen font scale to fit a fixed-height footer. Expanded navigation retains all destinations. Currency digits must remain grouped; larger text may change composition without reducing the numeric font.

Outstanding runtime checks:
- VoiceOver/TalkBack names, roles, selected/disabled/busy states and error announcements.
- Single-field code entry, paste/autofill, leading zeroes and incomplete-submit behavior.
- Real keyboard avoidance, focus order, focus visibility and reachability of the final field/action.
- 200% text, web reflow/text spacing, supported device sizes and landscape behavior.
- Actual hit areas, network recovery and payment/attendance outcomes.

References: [WCAG text resizing](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html), [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). Financial wording follows the project's approved settlement policy; this pass does not change backend rules.

Detailed node IDs and measured results are retained in visual-pass-4-evidence.json. Previous audit reports remain historical evidence.

