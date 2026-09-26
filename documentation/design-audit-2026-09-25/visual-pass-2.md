# HireQuick visual-system pass 2
25 September 2026

Updated directly in Figma. This pass focused on reusable components, typography, staff browsing/profile presentation, wallet hierarchy and checkout states. Prototype wiring was outside the scope.

## Delivered

- **40 button variants:** Primary, Secondary, Ghost and Danger × Large/Medium × Default, Pressed, Focus, Loading and Disabled. Existing component identities and screen labels are retained. Loading has an indicator; focus has a visible outside ring. Applied appropriate states to existing disabled controls and payment submission.
- **8 avatar variants:** Initials or Photo × Small 36, Medium 48, Large 64 and Profile 96. Initials are a valid first-class presentation and the missing/failed-photo fallback. The replaceable library photo is from Simple Design System; it is not presented as a HireQuick staff member.
- **Larger shared typography:** Body/M 16/24, Body/S 14/20, Label/L 16/22, Label/M 14/20 and Label/S 12/16. Archivo and Manrope retained.
- **Five interaction variables:** red/700, action/primary-pressed, action/danger-pressed, ink/on-danger-pressed and action/disabled. The file now has 97 local variables and 17 text styles.
- **Reusable transaction row** with editable title, detail and amount. The library now contains 25 component families: 13 sets and 12 standalone components.
- **StaffCard improvements:** readable wrapping, clearer identity hierarchy, four editable data properties and consistent initials treatment. Discovery uses a simple divided list instead of repeated bordered cards.
- **Profile improvements:** reusable avatar, less boxed About content and an explicit “No work photos added yet” state in place of blank image tiles.
- **Wallet improvements:** withdrawal directly below available funds, duplicate available-balance row removed from display, held/pending money grouped, and transaction history rendered with reusable rows. Applied to Light and Dark loaded states.
- **Checkout consistency:** cancellation summary and editing affordance added to the dark default; policy summary added to changed selection; submitting uses the real Loading component state.
- **Compact QA specimens:** 320px wallet with ₦1,250,000 and 320px staff discovery with a long name.

## Verification

- 40/40 button variants have unique names and the shared label property binding. All eight avatar variants bind the initials property.
- 64 active button label/background comparisons across Light and Dark passed, with a minimum ratio of **5.54:1**. Ghost buttons were evaluated against the canvas. Disabled states were excluded.
- Post-fix geometry checks found no unscrollable text-clipping candidates or horizontal text overflow across Account, Client, Usher, Shared, Admin and Marketing.
- The larger type exposed two verification footer overflows. Both content regions now fill the remaining viewport and scroll, keeping consent and Continue on screen.
- Visual review covered the button matrix, dark component specimen, both wallet themes, default/compact staff browsing, public profile, verification, and payment states.
- Visual review also caught cloned variants losing editable-label bindings. These were repaired and verified with distinct labels, including “Opening payment…” in the submitting screen.
- Sample photo is confined to library specimens. Named staff continue to use their initials.
- No application code or prototype wiring was changed. Shared component/style changes naturally propagate to instances.

## Open in Figma

- [Button state matrix](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=6-27)
- [Avatar variants](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=6-70)
- [Dark component specimen](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=2054-7)
- [Staff discovery](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=23-106)
- [Public staff profile](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=28-338)
- [Wallet](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=8-2)
- [Compact wallet](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=2048-1007)
- [Compact discovery](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=2048-1754)

The summary/history separation was informed by the inspected [Turo transaction-history reference on Mobbin](https://mobbin.com/screens/7ae17c22-0184-4155-91bc-d0a562cd26df), while retaining HireQuick’s distinction between estimated, held, available and withdrawn money.

## Still open

Marketing’s people-first redesign and mobile parity; neutral admin dispute-resolution review; complete chip/navigation interaction states; full policy access; broader 200% text, long-content and keyboard-visible specimens; and runtime VoiceOver/TalkBack, focus, hit-area, scrolling and recovery tests.

The compact specimens and static contrast measurements are design evidence, not WCAG certification. The original audit remains the baseline; detailed mutation and verification results are in [visual-pass-2-evidence.json](visual-pass-2-evidence.json).

