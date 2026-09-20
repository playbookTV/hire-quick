# Local admin interaction evidence — 18 September 2026

UI: current Vite application at `http://127.0.0.1:4174` with `VITE_API_URL=http://127.0.0.1:4199`.
API: existing `audits/2026-09-16/evidence/admin-ui-fixture.mjs`, loopback only, synthetic data. OTP is a fixture constant, not a real credential. No messages were sent, money moved, or real accounts modified. This fixture does not model production state transitions and cannot validate provider/approval execution semantics.

| UTC timestamp | Interaction / selector | Observed result |
|---|---|---|
| 18:27:48.073 | Open new isolated tab | Admin phone form rendered |
| 18:27:48.179 | Set `Admin phone number` to synthetic `+2348000000099`; click `Send sign-in code` | Sign-in code, Resend code, Change number rendered |
| 18:27:52.465 | Enter fixture code; click `Sign in` | Dashboard, six navigation destinations and linked counts |
| 18:27:58.522 | Click `Disputes` | One synthetic OPEN case; `Review case` action |
| 18:28:02.563 | Click `Review case` | Attendance/arrival/payment/party summary and dispute note; outcome/reason controls; no chat/media evidence |
| 18:28:12.692 | Close review; click `Approvals` | Pending request table; no status/history filter |
| 18:28:17.864 | Click `Review request` | Proposed amount, maker, booking context and review checkbox; decision controls disabled until reviewed. No decision executed |
| 18:28:29.759 | Close review; click `Ledger` | UUID filter, ledger table, newer/older controls; booking shown as text |
| 18:29:43.086 | Enter synthetic booking UUID; click `Filter ledger` | Same ledger surface; buttons are Log out, Filter ledger, Newer records, Older records; no booking detail/refund initiation action |

Each interaction was followed by an accessibility state read. The fixture intentionally returns simple sample ledger data; filtering semantics were not assessed. Console inspection showed no errors and two existing React Router future-flag warnings.

Verdict: **limited admin navigation/review evidence only**. Full UX-audit acceptance remains **Incomplete**: native mobile flows, two-admin rejection/revision, uncertain money results and real delivery were not executed. Screenshots were not collected in this flow-completeness pass; source and accessibility evidence establish the reported navigation gaps. Prior visual screenshots are in the 16 September audit.
