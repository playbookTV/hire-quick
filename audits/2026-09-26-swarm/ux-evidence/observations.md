# Runtime observations — 2026-09-26

Environment: HireQuick admin Vite dev server at http://127.0.0.1:5179, VITE_API_URL=http://127.0.0.1:4319; disposable synthetic API fixture; Codex in-app browser. No real login, messages, payments, database, or external API used.

1. Initial login: Tab focused email. Typed audit@example.test; Return requested OTP. Focus moved to Sign-in code.
2. Set viewport 320×568. Entered 000000; Return. Error text: “The sign-in code is incorrect or expired.” Email and OTP retained. Screenshot visible in tool transcript showed wrapping login card and strong input focus outline.
3. Replaced OTP with 123456; Return. Dashboard rendered. No pointer used for login journey.
4. Opened Open disputes then Review case. Focus moved to Dispute review region. Synthetic booking and attendance evidence, payment split, outcome select, reasoning field, and disabled confirmation button present.
5. Entered “Synthetic test reasoning retained after failed request.” Clicked Confirm payout decision. Fixture returned HTTP 503 without side effects. UI displayed “The outcome is unconfirmed. Reload the latest records before deciding again. Reload records before making another decision.” Textarea retained text; decision button disabled. DOM read reported innerWidth=320, documentElement.scrollWidth=320. Table has labelled horizontal scroll region.
6. Reload records dismissed review. Review case available again. The original uncertainty notice remained visible. No duplicate mutation request in request log.
7. Fixture mode restore-fail; reload page. Session unavailable with alert and Try again / Sign out. Fixture mode normal; Try again. Disputes rendered at original /disputes URL.
8. Opened mobile menu; Log out. Login rendered.
9. Fixture mode hang. Entered audit@example.test and Return. Request logged 09:36:09.354Z. At 09:36:09.667Z form aria-busy=true and only button disabled with text Please wait…. Stalled response intentionally held open.

Screenshots were viewed in browser tool transcript; no exported screenshot file was generated. Request log excludes credentials and email and contains only synthetic identifiers/reasoning.

10. At 09:37:02.700Z the first attempt had reset to a blank login. Browser console showed a new React startup at 09:36:49.799Z. Cause unknown; this attempt cannot establish a continuous stall.
11. Clean repeat: submitted same synthetic email again. At 09:44:01.974Z form busy=true. At 09:45:06.339Z form still busy=true and only button disabled with text Please wait…. Screenshot visibly showed the entered synthetic email and disabled button. Bounded observed interval >64 seconds, with no in-form recovery action. Read-only DOM input value was inconsistent with screenshot on the final snapshot and is not relied upon.
