# Minimum-click outreach implementation plan

Status: design and source-collection kit only. No application patch is included.

## Target experience
Final application message and CV -> edit/select contact candidates -> Link and add selected to queue -> Draft selected OR Send selected + one confirmation -> results/history.
Full message view is optional. No second mandatory user preview panel.

## Wiring sequence
1. Inspect current contact editing/import/linking routes, DOM hooks, queue service, snapshot constructor, ledger and worker interfaces. Match installer to source hashes.
2. Build editable per-address candidates, manual names/email rows and explicit inferred/imported/manual labels. Generation does not select all inferred candidates.
3. Link-and-queue: persist edited fields, resolve final recipient identities and CV, capture reviewed message and subject, validate plain/HTML parity, then add per-address rows. Report partial failures and duplicates honestly; make repeated requests idempotent.
4. Draft action: capture exact approved recipient/message/CV version; validate internally; reserve attempt; verify mailbox; call UTF-8 worker; persist actual provider IDs; update row without reload. Stale versions require refresh, not silent substitution.
5. Explicit retries: keep attempt history; definite preflight failures may retry. Another draft/send requires explicit user intent. Uncertain outcomes require reconciliation, not blind repetition. Do not implement retry by clearing ledger records.
6. Sending: implement an explicitly enabled server path; compact recipient/subject/CV confirmation; send existing draft by its recorded ID when selected. Installer never enables live sending automatically.
7. History: persisted confirmed outcomes, searchable/paginated, separate from working queue. Queue removal never implies Gmail deletion or history deletion.
8. Interactive states: selection counts, row-local busy/errors, bulk progress and per-row outcomes; prevent duplicate concurrent requests and preserve successful results.

## Existing bugs to cover
- Organisation URL used as greeting name; generic Candidate signoff.
- Stale review versus queued message, recipient, subject, or CV.
- UTF-8 Node/Python transport and decoded MIME parity.
- Actual Gmail failure/uncertainty versus local prepared-message display.

## Automated checks
Contact edits and custom rows; distinct inferred addresses; link/queue idempotency; identity construction; subject validation; attachment boundaries/hash; UTF-8 round trip; no live calls during tests; row/bulk partial outcomes; explicit duplicate attempts; uncertain-operation lock/reconciliation; send confirmation; history preservation; restart/stale-action behaviour.

## Installer requirements
Dry run, source-version checks, timestamped backups, additive/versioned DB migrations where needed, syntax/offline integration tests, installation report and rollback instructions. Preserve unrelated edits. Never clear production ledger, enable sending or perform live Gmail calls. Do not claim database rollback after live operations.
