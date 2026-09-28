# Checkout-recovery timeout investigation

Status: environment interruption confirmed; unchanged isolated reproduction passed.

Revision: `56a9d041ccd2f0d88a8a22aafaaf2fea90f4e00f`. The expanded API test run reported a 120-second timeout in `success wins expiry and worker recovers an interrupted INITIALIZING checkout`, with an observed duration of 1,000,015 ms. The test should reconcile a successful provider charge into a PAID checkout and CONFIRMED booking.

macOS power logs show clamshell sleep at 2026-09-28 01:16:01 +0100, followed by maintenance sleep from 01:16:50 for 985 seconds and a wake at 01:33:15. This overlaps the anomalous elapsed test duration. The timeout is therefore not evidence of a 16-minute continuously executing application operation.

Competing explanations: host sleep is supported by directly matching power-event timing; a deterministic checkout regression was not reproduced by rerunning the unchanged test alone in a fresh isolated schema. No production code, assertion or test timeout was changed. The interrupted broad suite was stopped through its Vitest child so the parent validation runner could clean up its schema.

The isolated rerun passed in 38,080 ms (one test passed, eight unselected tests skipped), within the unchanged 120-second limit. Both generated schemas were removed and removal was verified. No product fix was made. The broader suite is incomplete and is not claimed to have passed.
