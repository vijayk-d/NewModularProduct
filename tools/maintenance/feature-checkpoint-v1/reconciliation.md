<!-- feature-checkpoint-reconciliation-20261015 -->
## Current reconciliation — 15 October 2026

This dated section supersedes earlier current-status, test-baseline and next-action
statements, including the 10 October reconciliation. Historical sections remain
as the record of earlier milestones; this does not renumber the original plans.

### Evidence boundary

- Source snapshot: codebase-checkpoint-audit-20261014T231729786588Z.txt.
- Captured branch/HEAD: feat/review-provider-output / 2e12757. This is the audit
  reference, not a claim that a new checkpoint commit has been created.
- Existing focused tests and user-reported small live flows are distinct evidence.
  The user reported working draft/send flows and two-email batches; larger-volume
  behaviour and automatic uncertain-outcome reconciliation are not established.
- No fresh full-project test baseline is asserted here. Earlier 29/31/239 Node and
  14-browser counts are historical, not a current full-suite execution report.
- Legacy advert normalization is present in the source. A source audit alone does
  not confirm repair of existing database rows or the resulting Gmail draft.

### Delivered implementation

The application is no longer only an in-memory core. It includes the deterministic
JD/ATS/CV/letter core, JSON CLI, controlled template/inventory adapters, local PDF
extraction, HTTP review UI, organisation research, accepted refinement proposals,
contact import/linking/domain handling, persistent outreach, OAuth mailbox checking,
reviewed draft creation, explicit sending, recorded history and small bulk workflows.
Durable application-review storage and Save/resume controls are wired in startup;
live restart/resume validation remains separate from source presence. Inferred
contact email candidates are not verified mailboxes.

### Architecture at this checkpoint

Interfaces (CLI/HTTP/browser) call application services; the deterministic domain
remains separate from file/database/provider adapters. Durable application reviews,
contact/domain persistence, outreach queue and draft/send ledgers are distinct stores.
The Python Gmail workers form an external-effect boundary. Keep credentials and
private runtime data outside source control. Preserve exact-content confirmation,
CV-byte checks, version checks and uncertain-operation locks. Editing local source,
restoring it from Git, or saving an application must not reset a mail ledger or replay
an external operation. This reconciliation is not a complete architecture/security
sign-off or confirmation that every original requirement is finished.

### Remaining formal migration scope

Numbers here refer to NewModularProduct-Full-Migration-Plan.md, not the shorter
Overall Activity Plan, whose activity numbering is different.

- Area 11: PDF extraction exists; full fingerprinted indexing/cache remains open.
- Area 12: CV rebuilding remains a separate outstanding workflow.
- Areas 18–19: imported contacts/domain candidates do not establish automated
  recruiter discovery or ranking as delivered.
- Area 21: TSV export is optional/unverified; it does not block the working queue.
- Areas 22–25: Gmail/outreach implementation and limited live validation exist;
  large batches and automatic uncertain-outcome recovery are not signed off.
- Area 26: current persistence is not a complete freshness/TTL/retention policy.
- Area 27: durable reviews exist; application-file export/user-selected output
  handling and live restart/resume evidence remain distinct outstanding work.
- Areas 28–30: configuration/events exist; privacy, retention, security and recovery
  requirements still need explicit review rather than blanket completion claims.

### Checkpoint and next delivery

Create a reviewed WIP source/test checkpoint with its actual validation limitations.
Keep the 55 captured tracked utility deletions outside the feature checkpoint unless
separately approved. Keep both Playwright configs and the repair utility imported by
the normalization tests. Preserve local rollback packages. Do not broadly stage,
clean or delete untracked files; new runtime modules are among them.

The default Playwright config can reuse the normal server on port 3000. Full browser
regression must use a dedicated fixture server, temporary data and fake/disabled live
integrations. A different port alone does not isolate hard-coded runtime paths.

Next useful delivery is the unfinished export part of area 27: explicitly download
the reviewed letter as TXT/HTML, optionally with the selected existing CV, using safe
filenames. No CV rewriting, paid request or Gmail action is part of that export.
Interview/follow-up tracking is optional enhancement, not a new mandatory migration
prerequisite. Do not reopen broad cleanup or speculative refactoring to block usage.
