# Changelog

## 0.3 — Tidy check (28 Nov 2026)
- New read-only `nmpSchedulerTidyCheck`: reports row counts by action, rejected requests with the reason, the scheduler status of every job listed for tidy, how many rows the next tick would delete, trigger count and lock state, plus a plain-English verdict. Counts only; nothing changed or sent.
- Ticks now log what they did (busy lock, rows tidied) in Executions. Request checking is unchanged.

## 0.2 — Sheet tidy (27 Nov 2026)
- Signed `tidy` command: deletes stored request rows of finished jobs (SENT, CANCELLED, MISSED, BLOCKED) when the app clears them. Receipts and replay protection kept; pending and UNKNOWN jobs untouched.

## 0.1 — development candidate
- Existing Code.gs and appsscript.json remain the self-test pilot baseline.
- Add signed private-Sheet transport and a separate Google-hosted Gmail send worker.
- Add application schedule/review/cancel/status controls and existing-ledger reconciliation.
- Add offline protocol, service, HTTP, cloud-mock, worker and browser-fixture tests.
- Not live cloud-accepted or production-enabled; no Tampermonkey version changed.
