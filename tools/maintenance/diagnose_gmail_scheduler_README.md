Read-only Gmail scheduler cloud-readiness diagnostic

Extract into the repository; do not stop either server.
Run: node tools/maintenance/diagnose_gmail_scheduler.mjs

Uses the existing development launcher environment parser and configured Python.
Performs only account/Drive/Sheet reads using the existing scheduler authorisation.
Checks presence of configuration, OAuth/API clients, account identity, owner-only
privacy, Settings identity, and exact Requests/Jobs headers. No create, append,
update, send, trigger, .env, scheduling-state or database operation is performed.
Does not print environment values, keys, tokens, addresses, sheet IDs or cell contents.
The safe JSON summary can be shared. A successful result does not verify cloud
key agreement, trigger activity, Gmail send access or delivery.
No job is confirmed or scheduled by this diagnostic.

Validated here: six isolated diagnostic scenarios and JavaScript/Python syntax.
No real Google services were called here.
