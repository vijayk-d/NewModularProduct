# Dashboard and development-to-production history reconciliation

Date: 2 November 2026. Development candidate; production remains unchanged.

## Implemented slice
A read-only /dashboard route and JSON API, current-state metadata reader, and development-only cross-environment reconciliation PREVIEW. Uses existing vacancyIdentity/matchVacancy policy. No new dependency, background worker or operational database/schema. The reader opens known SQLite stores read-only and projects metadata in SQL, excluding CV/JD/letter/MIME bodies and private notes. Missing or incompatible history is unavailable, not a clean zero. Sender/message receipts deduplicate across history and ledger; queue sent markers are not proof of a send. Active manual submissions exclude voided events. Linked uncertain queue/ledger observations are counted once operationally.

Dashboard cards distinguish saved review records, confirmed outreach email events, user-recorded external submissions, identified vacancies, queue records, uncertain operations and storage size. Filters apply to displayed vacancy groups, not the all-history card totals.

The preview reads both state directories, proposes confirmed-history candidates, separates provider-ID duplicates/conflicts, lists reserved/uncertain development operations for manual attention, and distinguishes exact vacancy identity from possible organisation/role similarity. It never claims a clean duplicate check when data quality or coverage is incomplete.

## Explicitly NOT completed
No production database merge/import, automatic send blocking, activation/replay of queues/schedules, Gmail/inbox audit, ATS audit, archived-history search, retention or destructive cleanup. Actual reconciliation APPLY is a separate approval-gated phase requiring consistent backups, current schema/identity review, immutable source provenance, conflict resolution, idempotence and uncertain-operation protections. Imported historical facts must not become executable work. Manual submission/void chains need their own audit. The dashboard is an aid, not a guarantee that no previous application exists.

## Architectural boundary
Browser GET -> loopback same-origin dashboard handler -> read-only SQLite metadata projection -> pure history metrics/matching. Preview is available only in development. Current dashboard may later be promoted through the existing committed-release process, but cross-environment configuration remains under ignored var/history-dashboard/config.json, not credentials or production.env. No production state path is accepted from HTTP input. No write/import endpoint is provided.

Known default storage: development resolves existing NMP_STATE_DIRECTORY or project/output; production comparison is explicitly configured by the installer from the operator-provided production root/shared/data. Confirm these paths locally and review coverage before interpreting results. The config includes paths only, no credentials. Private preview download can contain organisations, recipients and provider IDs; do not upload or commit full history. Share summary counts/blockers only.

## Validation and delivery
19 focused pure/HTTP/real SQLite tests and 8 Chromium checks passed with temporary synthetic stores. Existing DB hashes unchanged. No full-current-checkout release regression or production acceptance claimed. Installer stages and runs the same tests using the current local vacancy-identity helper before writing. It adds source/tests/docs and narrowly hooks the existing request pipeline. The existing release plan becomes stale after installation; create/review one new plan after development acceptance rather than reusing the previous frozen plan.

Evidence-ranking work remains in progress/paused; this slice does not change it. New documents describe this candidate, not production release. Git commit/push and production promotion remain separate reviewed actions; installer does neither.
