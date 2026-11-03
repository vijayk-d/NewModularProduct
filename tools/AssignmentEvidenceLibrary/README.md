# Assignment Evidence Library — manual MVP, development candidate

Source: workflow-stabilisation-source-20261023T193256Z.json, 285 files, source HEAD 1c641c4 plus captured working-tree changes. Existing Problem solver, source-commentary, personal-instructions and presentation fixes are preserved.

## What is delivered
Visit http://127.0.0.1:3000/evidence-library after installing/restarting development, or use the new preparation/review navigation link.
Create an assignment overview, then multiple challenge/opportunity scenarios. Capture diagnosis, options, rationale, mechanisms, personal/team contributions, tactical response, documented strategic contribution, outcomes and learning. Evidence states and explicit approved wording are separate from private notes. Missing facts remain blank; no inferred metrics or generated career facts.
Save/resume locally; inspect immutable scenario versions. Assignment-context edits invalidate old scenario approvals, and stale tabs fail rather than overwrite. Download a PRIVATE TXT dossier with notes/source passages and interview prompts, or current approved extracts excluding raw notes/private titles/restricted and unsupported scenarios. Dossier export requires explicit confirmation. These downloads are sensitive; inspect before sharing.

## Deliberately not delivered
No AI extraction, paid calls, automated interview answers, scenario selection for polishing, CV rewriting, Gmail actions, deletion/retention UI or production enablement. The library does NOT yet supply evidence to cover letters automatically. This completes the manual pilot foundation only, not the whole roadmap.

## Install — development only
Extract ZIP into D:\monorepo\NewModularProduct. Stop development only. Run from the repository root:

python tools/AssignmentEvidenceLibrary/install.py --root .
python tools/AssignmentEvidenceLibrary/install.py --root . --apply --verify

Preflight checks exact normalized hashes without writing application files. Apply backs up originals, installs the 12 scoped files and runs syntax/126 focused tests. Verification failure restores scoped source. Source mismatches refuse, including changed/new files. No npm/pip installations, credentials, databases, Git staging/commit/push, production action or paid call occurs during installation.

Restart development using the existing launcher. NMP_ENV=development initialises `assignment-evidence-library-v1.db` in the EXISTING development state directory, normally output. It is separate from current application, contacts, outreach and intelligence stores. NMP_ENV=production does not create/enable the store. Do not change .env just to enable production. Library startup failures give an explicit unavailable response, not an empty-success claim.

## Local browser replay
python tools/AssignmentEvidenceLibrary/install.py --root . --browser

Uses the existing Playwright installation, dedicated config and an isolated in-memory server on a random port, not the normal 3000 or production 3100 server. Test records are synthetic, with no configured mail/research services.

## Validation and release
126 focused tests passed. The actual library/client ran in Chromium: assignment/scenario persistence through page reload, approval/export/history, stale approvals, and a 390px mobile form save passed without page errors. Separate unit tests verify database close/reopen, unknown-schema refusal, source/state validation, revision conflicts, no cross-assignment moves, private-export confirmation and cross-origin write blocking.
Full captured run: 943 passes, 11 failures. Unchanged capture: 920 passes, same 11 failures (including the older eight-tone assertion). See both logs and verification.json. This is not a green full-project production-release baseline. Replay in the complete checkout and resolve baseline failures before a production release. User acceptance of this MVP is not yet recorded.

## Data safety
The SQLite database and exported dossiers are private, NOT encrypted by this feature. Keep them outside Git and release/source archives. Take local backups of the state directory with the server stopped. Approval is your attestation, not automatic verification. Retention/deletion controls are deferred: use synthetic records for initial acceptance. Existing application/queue/mail records are never rewritten by the library.

## Checkpoint and production
No commit/push/deployment is claimed. Use the existing reviewed checkpoint workflow after acceptance, covering all uncommitted runtime dependencies rather than blindly committing this package alone. No new deployment mechanism is introduced. Production enablement/migration and data-retention approval remain a later release gate; leave production unchanged for this development-only slice.

## Rollback
Stop development and run:
python tools/AssignmentEvidenceLibrary/install.py --root . --rollback

Refuses if scoped files changed after installation. Restores original source bytes and removes only this package's new source/test/docs. It deliberately preserves the evidence database and all user data. Source rollback is not a data rollback.
