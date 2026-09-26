# HireQuick visual-system pass 3
25 September 2026

Updated directly in the existing Figma file. This pass addresses admin decision neutrality, cancellation-policy access, reusable interaction states and selected accessibility stress specimens. Prototype wiring and application code remain outside this pass.

## Delivered

- **Dispute review:** equal-weight client/usher choices, required rationale, explicit case navigation and a separate review screen naming recipient, amount and recorded reason. Neither outcome is preselected. The review action remains disabled until an outcome and rationale are supplied in the illustrated default state.
- **Policy fidelity:** an usher-favour outcome cannot release before completion and event end + 72 hours. Money requests above the configured threshold require a second admin. The design does not invent a threshold or claim that confirmation equals execution.
- **ApprovalStatus:** six dedicated states replace booking statuses in the main approval queue. The queue's selected “All requests” filter matches its mixed-status contents.
- **DecisionOption:** four selected/focus combinations with editable title and detail.
- **RationaleField:** Default, Focus, Filled, Error and Disabled; editable label/value and explicit error guidance.
- **Full cancellation policy:** reusable content, light/dark mobile screens, and visible policy controls in default, dark and changed-selection checkout. Includes exact 12/48-hour boundaries, no refund processing-fee deduction, 15% commission within the remaining usher allocation, and usher-cancellation/no-show refund treatment.
- **Chip:** eight combinations of selection and Default/Pressed/Focus/Disabled. Selected chips have a checkmark. Dimensions remain consistent across interaction states.
- **NavigationItem:** 16 combinations of selection, interaction state and Bottom/LargeText layout. Seven existing navigation symbols are reusable icon components. All ten client/usher bottom-navigation variants use these items. Selected state includes a distinct line as well as background fill.
- **Compact discovery:** filter chips wrap at 320px instead of clipping. Long-name content remains readable.
- **200% text specimens:** policy at 320×740, including an enlarged return action, and a 320px expanded navigation menu with 24px labels.
- **Checkout cleanup:** precise escrow reassurance and a safe-area indicator in the changed-selection screen.

The library now has **37 component families: 17 sets and 20 standalone components**, including seven navigation icons. Variables remain at 97 and text styles at 17.

## Verification

- **124 active text/theme comparisons** across the new or extended components passed the conservative 4.5:1 text benchmark. Minimum **5.193:1**.
- **18 focus-ring/theme comparisons** passed 3:1 against the adjacent evaluated background. Minimum **3.298:1**.
- Disabled variants were excluded from these contrast requirements. The measurement is limited to the recorded opaque solid-color pairs and components; it is not a whole-file recertification.
- **13 edited/specimen frames, 371 visible text nodes:** no horizontal text overflow or unintended immediate-parent vertical text overflow in the bounded geometry check. Intentional vertical scrolling is allowed.
- Policy's 200% text content grows to 3,191px, inside its scrolling viewport. Its return button is explicitly 28px/40px and expands to 107px high. The screen fits 320×740.
- All three newly placed Shared-page screens have no overlaps with existing top-level work.
- Screenshots reviewed the dispute default/review, approval queue, policy light/dark, checkout, chip matrix, navigation states, compact discovery, enlarged navigation and enlarged policy.
- Visual checks found and fixed clipped evidence messages, clipped filter chips, chip matrix placement, and a return-button text override that initially failed to enlarge.

These checks follow the design implications of [WCAG text resizing](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) and [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). Figma specimens do not establish actual keyboard behavior, assistive-technology semantics, scrolling, hit areas or conformance.

## Open the changes

- [Dispute decision](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=29-163)
- [Decision review](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=2064-116)
- [Approval queue](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=29-241)
- [Cancellation policy](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=2067-958)
- [Chip states](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=6-76)
- [Navigation states](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=2069-136)
- [Policy at 200% text](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=2073-1413)
- [Expanded navigation at 200% text](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=2072-349)

The approval list's explicit status labels were informed by the inspected [Aboard approvals reference on Mobbin](https://mobbin.com/screens/9ce069a2-2cbe-4c94-a7f5-b57050e50ca0). HireQuick retains its own financial approval and execution distinctions.

## Remaining work

People-first marketing and mobile content parity; broader enlarged-text and keyboard-visible states for identity, OTP, checkout, check-in, wallet and dispute entry; narrower admin layouts; and runtime accessibility and recovery checks. Prototype wiring remains explicitly deferred by the user.

The previous reports remain historical records. Detailed node IDs, mutations and measured comparisons for this pass are in visual-pass-3-evidence.json.

