# HireQuick Figma design audit
25 September 2026 · Read-only review · WCAG 2.2 AA design checks

**Verdict: substantial improvement is needed, but replacing the design system wholesale would waste good work.** The file has strong token adoption, clear primary buttons and unusually thoughtful financial error states. Its weaker areas are clipping, prototype integrity, status semantics, small-text density, and the visual presentation of people and work.

The interface often looks like a competent generic account-management app. Repeated cream canvases, rounded white cards, initials avatars and identical vertical stacks flatten the difference between hiring people, managing money and resolving disputes. This is an aesthetic assessment, not a claim about how the file was authored.

**15 prioritized findings: 6 P1, 9 P2; no P0 or P3 findings assigned.** P1 means a material design/accessibility or journey defect; P2 means a significant improvement or specification gap. These priorities do not imply observed production failures.

## Coverage and evidence

Inspected all nine pages structurally: Foundations, Account, Client, Usher, Shared Booking & Money, Admin, Marketing, Prototypes, and Coverage & Handoff. Visually inspected representative screens from every product area and targeted screenshots of suspicious controls and clipped financial messages.

- 12,050 descendant nodes and 3,816 text nodes inventoried.
- 156 top-level frames across Account through Marketing, including seven annotation frames; 37 additional prototype frames.
- Three variable collections, 89 variables: 37 primitives, 35 semantic colors, 17 scale tokens.
- 16 text styles and three effect styles.
- 22 reusable component families: 11 sets and 11 standalone components; 64 component nodes plus 11 sets when variants are counted.
- 3,815 of 3,816 text nodes have a text-style reference. This measures assignment, not proof that every instance has no overrides.
- All 6,788 inspected visible solid fill paints have variable bindings. This count includes duplicates and instances and does not certify every stroke, effect or property.
- 11,935 of 12,017 positive auto-layout gap/padding values are bound: **99.3%**.
- 7,470 text-segment/theme comparisons across Light and Dark returned **no below-threshold results in the conservative evaluated subset**.
- 46 text nodes without a known opaque ancestor background, 16 text nodes inside opacity groups, and 19 whitespace/empty text nodes were excluded from that final comparison. Opacity exclusions include inactive controls; they are not counted as WCAG failures.
- Geometry checks flagged **77 text nodes outside clipping ancestors with scrolling set to NONE**: Client 14, Usher 36, Shared 5, Prototypes 22. These are candidate node counts, including duplicates, not 77 independent defects. Representative financial examples were visually confirmed.

Evidence is retained in [evidence.json](evidence.json), including node IDs, measurements, semantic colors, component variants and every prototype edge.

This is a Figma design and specification audit. It does not establish app WCAG conformance, keyboard behavior, screen-reader semantics, performance, Dynamic Type, actual hit slop or backend correctness. No original Figma nodes or application code were changed.

## Design health

Scores describe the inspected design evidence, not an accessibility certification.

| Dimension | Score / 4 | Assessment |
|---|---:|---|
| Accessibility design | 2 | Text colors are strong; input boundaries and calendar state communication need repair. |
| Responsive readiness | 1 | Current-width clipping, one mobile width, no scrolling specifications on scanned product pages. |
| Theming and tokens | 3 | Excellent binding adoption; unsafe color combinations and incomplete state contracts remain. |
| Visual distinctiveness | 2 | Consistent, but repetitive cards and placeholder people weaken credibility. |
| **Assessed total** | **8 / 16** | Significant work before design sign-off. |
| Runtime performance | Not assessed | A design file cannot support an honest performance score. |

A separate visual review scored status visibility 2/4, real-world language 3/4, consistency 2/4, recognition 2/4, minimalist composition 3/4, and contextual help 2/4. No full Nielsen /40 score is given: interaction-dependent criteria were not user-tested.

## Priority findings

### 01 · P1 · Important content is clipped and cannot scroll in the specified design

**Evidence:** [Late payment refund](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=54-895), [Payment needs checking](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=24-307), [Wallet](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=8-2), [Event detail](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=23-296).

The late-payment screen clips the warning headed “These ushers are not booked” beneath the footer. The payment-checking screen cuts through its final reassurance sentence. Wallet activity and event-detail navigation also extend below their content containers. Relevant containers have clipping enabled and overflow direction NONE; no scrolling nodes were found on the seven product/prototype pages scanned.

**Impact:** warnings, transaction history and navigation disappear even at the designed 390-pixel width. This is a current design defect before large-text stress testing.

**Fix:** define a scrolling content region above a stable footer; allow content height to grow; include safe-area and keyboard behavior. Verify the full message and final list item can be reached on compact devices and with larger text. Do not simply shrink the text.

**Acceptance:** no unintended clipped content at default size; every off-screen item reachable by scrolling in the prototype. Suggested work: /adapt, /layout.

### 02 · P1 · The prototypes do not exercise the intended journeys

**Evidence:** [Prototypes page](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=2-91). There are 30 reaction-bearing nodes across 37 screens, three start points, and **15 screens unreachable from those start points through recorded navigation edges**.

Specific wiring:
- “Pay ₦80,000 with Paystack” on 37:460 leads directly to Payment failed, 37:1117.
- “Check status again” on 37:517 leads to Reservation expired, 37:1143.
- “Continue with Smile ID” on 37:725 leads to Verification rejected, 37:1169.
- “Check in” on 37:907 leads to Cancellation quote, 37:1200.
- Five entire screen frames carry click navigation, including Home, Jobs, Wallet and the event-day roster.
- The confirmed-payment screen and withdrawal sequence are among the unreachable screens.

**Impact:** this cannot reliably validate discoverability, successful completion or recovery. A test participant can tap the wrong region and appear to succeed, or encounter a failure unrelated to their choice.

**Fix:** connect actual controls; restore complete client and usher success journeys; give each intentional failure scenario a named start or explicit branch; wire recovery and Back. Keep success separate from scenario selection. The existing 300 ms Smart Animate transition on every recorded edge also needs contextual review and a reduced-motion alternative in handoff.

**Acceptance:** every intended journey reaches its documented outcome; every failure offers its intended recovery; no whole-screen catch-all targets. Suggested work: /shape.

### 03 · P1 · Default input boundaries fail the intended non-text contrast benchmark

**Evidence:** [TextField default](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=6-78), box 6:80; [Identity verification](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=14-59). Border/strong is the visible outline defining the white input box.

| Pair | Light | Dark |
|---|---:|---:|
| border/strong vs bg/surface | 1.75:1 | 1.62:1 |
| border/strong vs bg/canvas | 1.56:1 | 1.98:1 |
| border/focus vs bg/surface | 3.69:1 | 6.11:1 |

For control-identifying visual information, the benchmark is 3:1 against adjacent colors. The focus token passes the sampled pair; the default boundary does not. Labels do not make the faint editable boundary easier to identify. [WCAG 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)

**Fix:** introduce a control-specific border token meeting 3:1 in both themes. Preserve subtle decorative dividers; do not darken every border indiscriminately.

**Acceptance:** default, focused, error and filled input boundaries checked against both adjacent surfaces. Suggested work: /colorize.

### 04 · P1 · Availability relies on color to communicate state

**Evidence:** [Availability calendar](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=12-261). Available and unavailable dates are differentiated by pale fills; a separate legend requires matching those colors. The locked 14 uses a dark tile but lacks a lock symbol or local state label.

**Impact:** users can misread work availability, particularly with color-vision limitations or poor viewing conditions. The pale states lack a sufficient alternate visual distinction. This is a design-level concern under [WCAG 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html).

**Fix:** add distinct in-cell symbols for available/unavailable/locked, explain the selected date in text, and specify accessible names such as “14 March, booked, unavailable to edit.” Preserve color as reinforcement.

**Acceptance:** state remains unambiguous in grayscale without memorizing the legend. Calendar outer cells measure about 47.1×48; their 40×40 inner colored pads alone are not evidence of an undersized target. Suggested work: /clarify, /adapt.

### 05 · P1 · “Confirmed” means different things in different contexts

**Evidence:** [Public staff profile](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=28-338) shows Confirmed beneath the name while its action is Invite to an event. [Client Home](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=23-2) labels an event Confirmed while also saying “4 of 6 confirmed” and “2 to fill.”

**Impact:** an organiser can confuse identity verification, individual paid bookings and complete staffing.

**Fix:** use “Identity verified” for the person, “Booking confirmed” for a paid booking, and “Partially staffed · 2 needed” for the event. Add separate VerificationStatus and EventStaffingStatus components instead of stretching BookingStatus across entities.

**Acceptance:** each badge describes a named entity and an unambiguous condition. Suggested work: /clarify.

### 06 · P1 · Workers must infer their actual earnings

**Evidence:** [Available jobs](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=8-94) emphasizes ₦20,000 per person; [Confirm and pay](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=24-239) explicitly says the usher receives ₦17,000 after the 15% commission.

**Impact:** a worker comparing jobs can reasonably interpret the prominent listing amount as their payout.

**Fix:** make expected net earnings prominent on worker-facing job listings and details, with gross budget and commission available in a short breakdown. Use “Estimated earnings” while payment is unconfirmed; do not imply the amount is available to withdraw.

**Acceptance:** gross, expected net, held funds and available balance remain distinct through application, confirmation, completion and withdrawal. Validate the figures against the current canonical policy before implementation. Suggested work: /clarify.

### 07 · P2 · The mobile marketing design is an abbreviated different page

**Evidence:** [Mobile marketing](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=30-128) versus [Desktop marketing](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=30-2). Mobile omits the desktop occasions, organiser steps, usher benefits, FAQs and closing conversion section.

**Impact:** mobile visitors receive less help deciding whether to book staff or join as an usher.

**Fix:** preserve decision-critical content on mobile; adapt long sections into readable rows or disclosures. Intentional omissions should be documented.

**Acceptance:** both audiences can understand the process, payment protection and next step at either width. Suggested work: /adapt.

### 08 · P2 · The “all targets are 44×44” claim is unsupported by reusable navigation geometry

**Evidence:** [AppBar](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=7-101) has a 22×22 chevron frame. [Client bottom navigation](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=9-10) contains item frames 34×40, 58×40, 44×40, 63×40 and 47×40. Usher Jobs is 30×40. There are no separate 44-pixel minimum hit wrappers in these component structures.

**Impact:** downstream implementation may use the visible layer bounds as the interactive area.

**Fix:** wrap icons and tab items in explicit minimum hit areas. Set each tab to an equal-width slot and make the full slot interactive. Specify hit slop where needed.

**Important distinction:** this is a gap against HireQuick’s 44×44 design target, not automatic proof of WCAG AA failure. WCAG 2.2 AA uses 24×24 CSS pixels with spacing and other exceptions; actual interaction bounds must be tested. [WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)

**Acceptance:** the interactive wrapper, not the glyph, has a documented minimum size. Suggested work: /adapt.

### 09 · P2 · Too much useful information sits at 11–13 px

**Evidence:** 1,724 of 2,778 text nodes across Account through Marketing are 11 or 13 px: **62.1%**, including labels, metadata, navigation and duplicated states. Body/S is 13/19; Label/S is 11/14 with 4% tracking. Primary body and button text are 15 px.

**Impact:** readability can be technically high-contrast while still feeling small, dense and effortful. The wallet release explanation wraps WAT onto its own line.

**Fix:** keep Archivo + Manrope initially; the fonts are not the primary problem. Test 17/26 for important mobile prose, 15/22 for supporting content, and 13/18 for genuinely secondary metadata. Reserve 11 px for rare nonessential labels, not recurring navigation. Keep date, time and timezone together where practical. Use tabular numerals for comparable money columns where supported.

**Acceptance:** review with real names, long event titles, large amounts and larger text. No WCAG minimum-font-size failure is claimed; assess resizing separately under [WCAG 1.4.4](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html). Suggested work: /typeset.

### 10 · P2 · Component state coverage is incomplete and awkwardly modeled

**Evidence:** [Button](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=6-27) has Primary, Secondary, Ghost, Danger and Disabled as one Variant axis, plus two sizes. It has no Loading, Pressed or Focus state axis. TextField does have Default, Focus, Error, Filled and Disabled.

**Impact:** disabling a danger action loses its semantic identity in the component contract, while ad hoc opacity overrides appear elsewhere. Browser/admin keyboard focus and pending actions lack a consistent visual specification.

**Fix:** separate intent, size and interaction state; define loading feedback, pressed response, keyboard focus and disabled treatment. Add needed states to navigation and chips too. Native and web need different interaction details.

**Acceptance:** state transitions preserve action meaning, dimensions and accessible labels. Disabled controls are exempt from minimum contrast; do not count their dim labels as ordinary text failures. Suggested work: /shape.

### 11 · P2 · A people marketplace has too little evidence of people

**Evidence:** [Discover](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=23-106), [Staff profile](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=28-338), and both marketing frames. Initials dominate; profile work photos are empty blocks; marketing is text and cards.

**Impact:** users cannot judge relevant experience and service quality convincingly. The screens feel generic and interchangeable.

**Fix:** use approved portraits, actual event-work imagery, relevant skills/languages and credible reviews. Give browsing a people-led composition, wallet a financial-summary composition, and admin a queue-and-evidence composition. Reduce unnecessary card boundaries. Marketing should follow the recorded people-first brief; its present green/cream direction also conflicts with the later marketing direction in .impeccable.md.

**Acceptance:** the design demonstrates real content and honest empty/loading/photo-unavailable alternatives. Do not fabricate testimonials or portray stock photos as actual staff. Suggested work: /layout, /bolder.

### 12 · P2 · Payment review explains commission better than the booking commitment

**Evidence:** [Confirm and pay](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=24-239). The amount breakdown is clear, but there is no visible edit affordance or contextual cancellation summary. The title repeats in navigation and body while unused space separates the summary from the final action.

**Impact:** users can see what they pay more clearly than what they are agreeing to.

**Fix:** retain the precise total and escrow reassurance. Add a compact current cancellation summary with access to full terms and a clear route to edit selections. Explain payment confirmation and attendance protection in plain language without promising instant release.

**Acceptance:** before paying, the user can review staff, event/time, total, cancellation implications and what happens next. Suggested work: /clarify, /layout.

### 13 · P2 · Dispute resolution visually favors one outcome

**Evidence:** [Admin disputes](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=29-163). Refund client ₦15,000 is the dominant red action; Award to usher is secondary. The title says three open cases but the displayed case lacks visible next-case or back-to-queue navigation. No rationale or final review affordance is shown in this frame.

**Impact:** strong visual weighting can bias a consequential decision; weak queue context adds operational friction.

**Fix:** use neutral resolution selection, required rationale and a consequence review naming recipient and amount. Make queue navigation explicit. Confirm current policy and approval behavior before changing any financial workflow; this audit does not claim the backend lacks safeguards.

**Acceptance:** evidence review and resolution choice precede final execution; both legitimate outcomes receive neutral treatment. Suggested work: /shape.

### 14 · P2 · Responsive and accessibility stress states are not demonstrated

**Evidence:** product mobile frames use 390 px; admin uses 1440 px. Identity verification even grows to 862 px while most device frames are 844 px. Current clipping already shows the weakness of the fixed composition.

**Impact:** the file cannot demonstrate usability on narrower/shorter devices, with the keyboard open or with larger text.

**Fix:** add compact-phone and large-text examples for identity, OTP, checkout, check-in, wallet and dispute entry; specify keyboard avoidance. Add narrower admin behavior and mobile marketing parity. Test the implementation for text resizing, [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), and [text-spacing overrides](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html).

**Acceptance:** no lost actions or meaningful text at required sizes; focus remains visible; reading order and screen-reader output are tested in the actual app. These remain unverified, not assumed failures. Suggested work: /adapt.

### 15 · P2 · Handoff overstates what was verified

**Evidence:** [Coverage and handoff](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=34-7) states zero contrast failures and zero targets below 44×44. The latter does not match navigation wrapper geometry. It records 3,812 text nodes; current inventory is 3,816. [Button documentation](https://www.figma.com/design/Ep6MkJEc079aM6I0pQbwhw/HireQuick-Redesign-2026?node-id=6-27) says primary is “brand yellow,” while its actual semantic accent is green #36A511.

**Impact:** engineers can treat stale summary claims as acceptance evidence. Small factual contradictions weaken trust in otherwise detailed documentation.

**Fix:** publish dated audit scope, exclusions and reproducible measurements. Distinguish text contrast, control contrast, hit areas, static geometry and live accessibility.

**Acceptance:** every “pass” names what was measured and what remains untested. Suggested work: /audit.

## Token and typography decisions

Keep the semantic aliases and mode architecture. They are genuinely useful and extensively adopted.

| Token/system | Recommendation |
|---|---|
| border/strong | Split decorative border strength from accessible input/control boundaries. |
| brand/accent-text | #227F08 measures 4.57:1 on canvas, but only 4.14:1 on surface-alt. Document allowed surfaces or add a stronger foreground. This is a latent pairing risk, not an observed active text failure. |
| brand/accent | Dark ink on #36A511 is 5.54:1. Preserve a separately tested on-accent role when revising the brand palette. |
| elevated vs inverse | Keep the distinction: an always-dark panel and a theme-flipping element need different foreground contracts. |
| semantic statuses | Split person verification, event staffing, booking, payment and withdrawal language. |
| interaction tokens | Define control border, focus ring, pressed, loading and disabled roles. |
| typography | Keep the font pairing, improve role sizing and wrapping; add usage guidance to the currently empty text-style descriptions. |
| spacing | Retain the scale and high binding rate; verify the remaining values before indiscriminately tokenizing exceptions. |

## Mobbin references and what to borrow

These recommendations come from actual returned previews, not app names alone. The references are pattern inspiration, not accessibility-certified examples.

| Reference | Observed pattern | HireQuick application |
|---|---|---|
| [Fiverr profile](https://mobbin.com/screens/78d6e600-7316-4af5-83f2-c246c30dc198) | Portrait, explicit vetted status, rating and areas of expertise. | Give staff profiles human identity and evidence; keep verified identity distinct from booking status. |
| [Peerspace profile/booking](https://mobbin.com/screens/35ede26c-78c5-4829-b6b4-97700a2ec762) | Host identity, policy disclosure and a persistent price/action area. | Keep event context and booking action accessible while exposing relevant policy. Do not copy prebooking messaging if HireQuick policy forbids it. |
| [Airbnb service reservation flow](https://mobbin.com/flows/8cbcaf23-5bb1-4f0c-8efa-05806e484b0d) | The sampled review screen groups cancellation, payment method, price details and confirmation. | Reorganize checkout around the commitment being made; preserve HireQuick’s escrow rules. |
| [Peerspace checkout flow](https://mobbin.com/flows/8dd92276-1cb7-466e-b404-9f58be7328e1) | Sampled screens retain booking context and place cancellation policy near final payment. | Offer contextual review and policy access before payment. |
| [DoorDash Dasher earnings](https://mobbin.com/screens/63f22cfd-d488-4c4a-9e89-8299ca8ec389) | Clear earnings headline, payout-details action and history section. | Reduce wallet duplication and clarify the next release/action. Its promotional panel is not a pattern to copy. |

The web search results were weak matches for event-staffing marketing, so they are not used as evidence for that recommendation. The existing people-first project brief is the stronger basis there.

## What to preserve

- Clear, reachable main buttons at 44 or 52 px height.
- Consistent Archivo/Manrope pairing and strong monetary hierarchy.
- Real semantic color aliases, explicit modes and extensive layout binding.
- Available, held and pending money distinguished in words.
- Error, offline, stale, uncertain-payment and failed-balance designs. These are more mature than a happy-path-only mockup.
- Explicit fee arithmetic and the separation of client total from worker payout.
- Detailed handoff rules, after correcting their stale audit claims.

## Recommended sequence and exit checks

1. **/adapt + /shape:** fix clipping and prototype navigation first. Retest the payment, verification, check-in and withdrawal journeys.
2. **/colorize + /clarify:** fix control contrast, calendar cues, entity-specific statuses and net-earnings language.
3. **/typeset + /layout:** enlarge critical small text, improve wrapping, reduce repeated cards and give each task an appropriate composition.
4. **/bolder + /adapt:** build credible people-first marketing and complete its mobile content.
5. **/audit:** validate both themes, the component state matrix, compact/large-text layouts and live keyboard/screen-reader behavior.
6. **/polish:** finish spacing, alignment, dates, truncation, icon consistency and motion only after the preceding issues pass.

These passes can be run individually or together. Re-run /audit and /critique after changes; compare the same evidence scope rather than treating a rising aggregate score as proof of accessibility.

Runtime release checks still required: VoiceOver/TalkBack names and states, OTP paste/autofill, focus order and focus visibility, error association and announcements, keyboard avoidance, real hit areas, large text, web reflow and text spacing, reduced motion, contrast over actual photographs, loading/performance on representative devices, and outcome/recovery behavior under network failure.

