# HireQuick — first design repair pass
25 September 2026

Applied directly to the [Figma file](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026). This pass addresses the six P1 audit findings at the design/specification level, plus navigation targets, checkout review and stale handoff claims. It is not a full visual redesign or an app accessibility certification.

## Changes applied

| Area | Change |
|---|---|
| Content access | 163 existing mobile content regions now specify vertical scrolling above their footers. Seven new prototype outcome screens bring the total to 170. The late-payment “These ushers are not booked” warning was moved into the initial viewport. |
| Control contrast | Added neutral/550, accent/650 and border/control variables. Input and other strong control outlines use border/control. Decorative subtle dividers retain their original treatment. Strengthened the light-theme accent-text foreground. |
| Navigation | Client and usher tabs have equal 74.8×44 slots at the 390px design width, with a new 12/16 Navigation/Label style. Back/close glyphs have explicit 44×44 wrappers. Removed inherited uppercase navigation overrides. |
| Calendar | Added ✓ Available, × Unavailable, ● Booked and ? Not set markers to all three calendar states, including Dark. Booked dates explicitly say they cannot be edited. |
| Status semantics | Added VerificationStatus and EventStaffingStatus component families. Public/self profiles use Identity verified. Event badges now distinguish Recruiting, Partially staffed and Fully staffed from individual booking confirmation. |
| Worker earnings | Job cards emphasize estimated net earnings: ₦17,000, ₦21,250 and ₦12,750 for gross budgets of ₦20,000, ₦25,000 and ₦15,000. Detail copy distinguishes release eligibility from immediate wallet availability. |
| Prototypes | Removed five whole-screen click targets. Connected actual controls, repaired payment and verification routes, and added honest application, attendance, arrival-report, generated-code, dispute, withdrawal-tracking and cancellation outcomes. Ten named start points separate success, event-day, released-wallet and recovery scenarios. |
| Checkout | Default checkout and its prototype now include Edit selected staff, a single clear review heading, and cancellation refund bands adjacent to payment. The prototype edit action returns to selection. |
| Handoff | Replaced stale blanket pass claims with dated measurements and limitations. Added typography role/wrapping descriptions to all 17 text styles. |

## Verification

- **44/44 prototype frames reachable** from ten named starts through recorded navigation edges; **zero whole-screen click targets**.
- **170/170 inspected mobile content regions specify vertical scrolling**. A fresh geometry scan found **zero unscrollable text-clipping candidates** across Account, Client, Usher, Shared, Admin and Prototypes. This checks layout properties; it does not prove real scroll interaction.
- New control-border pairs measure **3.68–5.65:1** against canvas, surface and surface-alt across Light and Dark.
- Updated accent-text pairs measure **5.19–8.98:1** on those same surfaces.
- Shared navigation geometry measures **74.8×44 per tab** at the current device width.
- Visually reviewed light/dark calendars, job cards, client event badges, public profile verification, checkout, late-payment warning, new application/check-in outcomes, navigation and revised handoff evidence. Fixed a text-height regression found in the new prototype outcome screens before completing this pass.
- Currency calculations follow the approved 15% commission policy; cancellation copy follows the approved >48h / 12–48h inclusive / <12h bands.
- Mutation results and structural checks are retained in [repairs-evidence.json](repairs-evidence.json). The original [audit report](report.md) remains an unchanged baseline.

## Review in Figma

- [Foundations and components](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=0-1)
- [Worker job cards](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=8-94)
- [Availability calendar](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=12-261)
- [Checkout](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=24-239)
- [Late-payment refund](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=54-895)
- [Prototype journeys](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=2-91)
- [Application sent](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=2024-719)

## Remaining work

The original audit is not closed. The following deserve the next design pass:

1. Broader typography and composition improvements: increase important supporting text, simplify wallet/card repetition and improve content hierarchy.
2. Complete the component interaction-state matrix, preserving intent through loading, pressed, focus and disabled states.
3. Extend the revised checkout pattern to remaining state variants and provide complete policy access.
4. Replace empty photo blocks with approved staff/event imagery and honest unavailable-photo treatments; apply the people-first marketing direction and restore mobile content parity.
5. Redesign admin dispute resolution around neutral choices, rationale and consequence review.
6. Add compact-width, large-text, long-content and keyboard-visible stress frames.
7. Test actual prototype interactions and the implemented app: screen-reader names/states, focus, keyboard avoidance, target hit areas, text scaling, reduced motion and failure recovery.

Prototype state transitions are illustrative scenarios, not connected payment, verification or attendance operations. Calendar symbols still need accessible names in implementation. New outcome states currently live on the Prototypes page. No application implementation was changed in this pass.

The previously reviewed Mobbin references continue to inform the work: the Peerspace and Airbnb review patterns informed contextual policy and an editable selection before payment; the worker earnings reference informed net-earnings emphasis. Approved human imagery and the broader visual redesign remain outstanding.

