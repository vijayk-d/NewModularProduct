# NewModularProduct — Overall Activity Plan and Status

**Status date:** 30 September 2026  
**Current verified baseline:** 31 passing tests, 0 failures (`node --test`)  
**Latest committed workflow checkpoint:** `f8ccd33 feat: compose pure application preparation workflow`

## Delivery roadmap

| # | Activity | Goal / deliverable | Status | Evidence / notes |
|---:|---|---|---|---|
| 0 | Establish safe migration boundary | Use sanitized legacy source only; exclude secrets, actual CVs, local configuration, generated outputs, outreach, UI, and integrations from the first slices | Complete | Migration work used focused source/test inspection and synthetic fixtures only |
| 1 | Discover verified legacy contracts | Extract behavior from source and Node tests for parser, ATS scoring, CV selection, path selection, and cover-letter generation | Complete | Replaced earlier inferred summaries with direct source/test-backed contracts |
| 2 | Set up modular Node project | Create ESM project, Node test command, source/test layout, Git hygiene, ignore rules, line-ending policy | Complete | `package.json`, `.gitignore`, `.gitattributes`; `node --test` |
| 3 | Implement shared text primitives | Provide normalization, tokenization, uniqueness, and overlap operations | Complete | `src/domain/shared/text-normalization.js` |
| 4 | Implement JD parsing | Convert raw job text into structured role, keywords, methods, location, domain, seniority, and clearance signals | Complete | `parseJobDescription()` plus contract tests |
| 5 | Implement ATS assessment | Score an in-memory CV against a parsed JD and return explanation components/suggestions | Complete | `scoreCvAgainstJd()` plus scoring tests |
| 6 | Implement CV ranking and best/alternative selection | Rank candidates and return a recommendation | Complete | `rankCvCandidates()` and `selectCv()`; preferred-code tie-breaker corrected intentionally |
| 7 | Implement selected-path candidate policy | Narrow inventory by path identifiers and synthesize metadata for unknown selected identifiers without I/O | Complete | `selectCvsByPath()`; Windows path semantics are explicit and tested |
| 8 | Implement cover-letter domain | Fill templates, validate output, generate draft, clean citation markers, add ATS paragraph, and highlight terms | Complete | Explicit template required; candidate details supplied as inputs rather than hard-coded |
| 9 | Compose pure application workflow | Provide a single in-memory operation from JD input to CV recommendation and validated cover letter | Complete | `prepareApplication()` plus two end-to-end synthetic tests |
| 10 | Write/update architecture documentation | Maintain high-level/low-level design, diagrams, contracts, boundaries, and roadmap | Complete, needs small refresh | Markdown document exists; update baseline from 29 to 31 tests and mark `prepareApplication` implemented |
| 11 | Add JSON CLI interface | Read one JSON request from stdin; run application workflow; emit one JSON result to stdout; report errors to stderr | Ready to start | Design and code plan prepared; not yet implemented or tested |
| 12 | Validate CLI end-to-end | Add CLI command tests and a synthetic stdin/stdout smoke test | Not started | Target after Activity 11: 36 tests total expected |
| 13 | Commit CLI checkpoint | Commit only CLI adapter, CLI tests, and package script change | Not started | Planned commit: `feat: add JSON application preparation CLI` |
| 14 | Define infrastructure ports | Specify stable interfaces for template storage, CV inventory, and document text extraction | Planned | Must stay outside `src/domain` |
| 15 | Add template-loading adapter | Load an explicit named template from a controlled source and pass it to pure application workflow | Planned | Prefer this before CV document ingestion |
| 16 | Add CV inventory adapter | Load candidate metadata from an approved storage format and map it to domain input shape | Planned | No real personal data until privacy/storage policy is decided |
| 17 | Add document text extraction adapter | Extract text from approved CV documents with error handling, path validation, and optional caching | Planned | Requires careful sensitive-data handling; do not put in domain |
| 18 | Add a human-facing interface | Choose CLI enhancements, HTTP API, or web UI after the JSON boundary is stable | Planned | Interface should call application services, never domain internals directly |
| 19 | Add optional external research/refinement ports | Integrate company research or LLM refinement through explicit interfaces and audit/error controls | Deferred | Requires explicit provider, privacy, cost, and secret-management design |
| 20 | Add outreach/email only with safety design | Create drafts/queues first; require explicit confirmation before any send operation | Deferred | Separate high-risk slice; credentials, consent, recipient resolution, and audit trail required |

## Current architecture state

```text
Implemented and tested

Job-description text
  → parseJobDescription
  → selectCvsByPath (optional path subset)
  → scoreCvAgainstJd
  → rankCvCandidates / selectCv
  → generateCoverLetter / validateCoverLetter
  → prepareApplication

Next boundary

JSON stdin
  → CLI adapter
  → prepareApplication
  → JSON stdout
```

## Completed checkpoints

| Commit | Checkpoint |
|---|---|
| `aa70cce` | Pure JD parsing and CV ranking core |
| `694f7eb` | `.gitignore` protection |
| `bdd32a1` | Text-file line-ending policy |
| `7a2fdb1` | Pure CV selection policy |
| `48fff66` | CV path selection policy |
| `f8ccd33` | Pure application preparation workflow |
| Cover-letter checkpoint | Implemented and tested; verify its exact commit hash locally if needed |

## Decision gates

1. **Before Activity 11:** Confirm the architecture document is refreshed to the 31-test baseline.
2. **Before Activities 14–17:** Decide where candidate data may be stored, who can access it, and whether it may contain sensitive personal information.
3. **Before Activity 19:** Select providers and define data minimization, cost limits, retry behavior, logging, and secret storage.
4. **Before Activity 20:** Require a separate communication-safety design with explicit human approval for every send action.

## Recommended immediate next action

Implement **Activity 11: JSON CLI interface**, then run its command tests and a synthetic stdin/stdout smoke test. This makes the completed pure workflow usable without widening the trust boundary.

## Milestone reconciliation - 10 October 2026

This section supersedes the earlier current-baseline, executive-status,
and immediate-next-action statements. The original capability plan and
implementation order remain in effect.

### Delivered since the original baseline

- JSON application-preparation CLI and command tests.
- Controlled template and JSON CV inventory adapters.
- Local PDF text extraction; full indexing/cache is not confirmed complete.
- Local HTTP application preparation and interactive review interface.
- Organisation research through an explicit Perplexity adapter.
- Cover-letter refinement proposals with explicit user acceptance.
- Contact import, persistence, linking, unlinking, and deletion workflows.
- Per-import business-domain selection in LinkedIn userscript version 0.4.1.

### Latest completed checkpoint

- Commit: 4f45966 - Move LinkedIn userscript and replace hardcoded import domain.
- Live validation: version 0.4.1, entered ageas.co.uk, generated candidate
  nico.detullio@ageas.co.uk, no reported error.
- This validates candidate-domain handling, not mailbox verification.
- Agreed repository cleanup checkpoint is closed.
- Last reported test baseline: 239 Node tests and 14 browser tests passing.
  These tests were not rerun for this documentation update.

### Outstanding and deferred scope

- Automated recruiter discovery/ranking is not established as delivered.
- Recruiter TSV/export and reviewable outreach preparation remain the next
  planned delivery area, subject to checking existing implementation.
- Older-duplicate review-domain projection remains deferred unless it blocks
  the next delivery.
- Full CV indexing/cache, CV rebuilding, and persistent application output
  are not established as complete.
- Gmail OAuth, draft creation, and sending remain deferred behind Phase D gates.

### Delivery focus

Follow the existing roadmap. Deliver the smallest useful vertical slice,
use focused validation, and record status/evidence at each milestone.
Do not reopen cleanup or add speculative refactoring as prerequisites.

Next delivery slice: persistent local outreach queue from selected linked
contacts, with explicit recipient selection and message review. Gmail draft
creation follows, then explicitly approved sending. TSV export is optional.

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


## Current reconciliation — 16 November 2026

Evidence boundary: Git history on master up to `fcadb54` and the Patch A branch. Production states below are as reported by the owner after `ship.cmd`.

### Released and user-verified in production
- Evidence and scenario quality: PRs #13–#17 (tone/ROI bullets, evidence selection checks, ordering, tuning, respecting selected scenarios).
- Contacts and search: PR #18 (company People search links), PR #20 (search tabs open all).
- Review workspace (Slice 2 scope largely delivered): PR #19 (UI quality pack), PR #22 (vacancy details and polishing layout).
- Area 27 export completed: PR #23 (career-portal cover letter from the private Word template, letter PDF, production template in `<state>/cover-letter-export`), PR #24 (setup command fix), list spacing (`145e730`), PR #25 (current CV library lookup, PDF/DOCX/both CV choice, upload-friendly file names, pack summary). See [docs/cover-letter-template.md](docs/cover-letter-template.md).

### In progress
- Patch A from [docs/next-slice-implementation-plan.md](docs/next-slice-implementation-plan.md): email background radio buttons with swatches, and opening the exact CV PDF in a new tab. Tested in isolation on branch `feat/patch-a-palette-pdf-preview`; not yet user-verified or released.

### Next candidates, in recommended order
1. Gmail readiness display: distinguish "turned off in configuration" from missing credentials or sign-in failure. Needs the owner's drafts-only versus drafts-and-sending decision first; production configuration is changed by the owner.
2. Patch B, evidence-library quality: audit one assignment and fill scenario gaps (multiple scenario selection already delivered in PRs #10 and #17).
3. Larger, each needing its own design: application follow-up/interview tracking, CV indexing cache (area 11), CV rebuilding (area 12).


## Current reconciliation — 17 November 2026

This section supersedes the 16 November "In progress" and "Next candidates" lists. Evidence boundary: Git history on master up to `1c94a02`. Production states are as reported by the owner.

### Released and user-verified in production
- Everything listed as released on 16 November.
- Patch A (PR #26): email background radio buttons with swatches; open the exact CV PDF in a new tab.

### Merged to master, release and production check pending
Merged on 16–17 November (`a68435d`, `8b67a66`, `1c94a02`). Ship with `tools\deploy\ship.cmd`, then verify in production.
- **Review layout and letter length** (`11e87f3`): grouped action bar ("Export pack", "Unsent messages"); a Custom letter length of 150–700 words in steps of 25, capped by the configured maximum; length labels "Standard senior", "Extended strategic" and "Custom N words".
- **Workflow automation** (`60c68d1`), see [docs/workflow-automation-opportunities.md](docs/workflow-automation-opportunities.md):
  1. Choosing a stored advert loads and applies it in one step.
  2. The Export pack CV choice is remembered in the browser.
  3. Same-organisation contacts get a badge and are listed first.
  4. Advert status: Complete once a portal pack is exported; Needs attention after 14 days without activity.
  5. Follow-ups due on the dashboard (confirmed email, no later activity for 7–60 days; reminder only).
  6. Organisation research once per organisation: automatic on the first application (at most 10 calls a day, `ENABLE_AUTO_RESEARCH` / `AUTO_RESEARCH_DAILY_CAP`), reused for 30 days and on page reloads; the button always researches again; no retries.
- **Email domain fix** (`a346d07`): a domain found by research or **Find email domain** replaces the old one, is saved on the application, refreshes linked contact emails and updates the browser copy used by the LinkedIn contact bridge.
- **Storage:** new file `<state>/workflow-automation-v1.db` only; no existing database or schema changed.
- **Tests at merge:** Node 1581 pass, 1 known failure (`default template generates linked rich opening and valid plain fallback`, also failing before these changes); UI suite unchanged apart from the new passing specs (4 known `application-preparation` failures in the local worktree run).

### Known issues
- The two known local test failures above should be investigated in their own slice; CI is the release gate.
- Fixed: a failed delivery no longer blocks a reship. `local_delivery.py deliver` now renames a provably unpromoted `releases\<commit>` (has `candidate.json`, no `release.json`, not active) to `failed-releases\<commit12>-<timestamp>`; nothing is deleted and any other existing release folder is still refused.
- A manually typed email domain is now replaced if research later finds a different one (intended; owner request).

### Next candidates, in recommended order
1. Verify the release above in production.
2. Gmail readiness display: distinguish "turned off in configuration" from missing credentials or sign-in failure. Needs the owner's drafts-only versus drafts-and-sending decision first.
3. Patch B, evidence-library quality: audit one assignment and fill scenario gaps; strengthen evidence lines that have no measurable outcome without inventing figures.
4. Deployment robustness: done (failed release folders are moved aside automatically).
5. Larger, each needing its own design: interview tracking (follow-ups are now listed), CV indexing cache (area 11), CV rebuilding (area 12).
