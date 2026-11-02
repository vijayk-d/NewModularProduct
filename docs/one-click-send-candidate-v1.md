# One-click send candidate v1 — development rollout, OFF by default

The existing prepared-message protocol and backend ledger remain. With ENABLE_ONE_CLICK_SEND=true in development on port 3000, the labelled Send action saves reviewed edits, freezes selection/mailbox/version/action, prepares internally, and commits without a second Send dialog. Internal batches remain at most 25 and retain pacing. Already-sent rows remain excluded from bulk; explicit row Send again stays separately labelled.

Flag absent/false: prior confirmation flow remains. Production cannot activate this candidate. Installing does NOT edit .env, enable Gmail or send anything. Do not set the new flag before local tests and review. Existing Gmail/master send flags, mailbox identity and storage gates still apply.

Bound one-click preparation validates queue version, sender, recipient, mode and draft ID. Gmail draft body/CV/subject differing from the reviewed queue is blocked inline; resynchronise/review rather than sending hidden changes. Internal tickets, expiry, CV/MIME checks, reservations and outcome ledger remain. No automatic retry of uncertain outcomes; no auto-resume or selection expansion. The UI locks selection/message controls, shows mailbox and contact warnings inline, and retains Stop after current.

A successful API result is still required before an item is counted sent. There is no exactly-once-delivery guarantee from the UI alone. Do not delete reservations/history to get a green result.

Tests must use fake adapters. Offline demo runs the real new batch function with an in-memory fake API and blocks network; it is not a complete test of the live queue page. Four SQLite protection tests skipped on sandbox Node20 MUST run on your Node24 checkout before activation. Full browser/fake-backend validation and release verification are still local acceptance gates.

Activation is a deliberate development-only step after tests/review: add ENABLE_ONE_CLICK_SEND=true to DEVELOPMENT .env, restart port 3000 and verify the status explicitly says One-click send ON and shows the right mailbox. Do not alter other Gmail flags to bypass a blocked status. Disable by false/removal and restart. Do not upload .env. No production activation in this package.
