# Feature checkpoint v1 — deliberate WIP capture, not a release claim

Extract this ZIP into D:\monorepo\NewModularProduct. All package files go under
tools/maintenance/. Existing application source, configs and private data are not
replaced by extraction. No inner ZIP extraction or server restart is needed.

Scope: 56 feature/source/test/ignore candidates from the reviewed audit, plus the
three existing formal documents (59 possible staged paths). Includes the repair
utility imported by the normalization tests. The 55 tracked tool deletions, Python
bytecode, installer archives, root artifacts and other maintenance tools are outside
this feature checkpoint. Both existing Playwright configs remain untouched/tracked.
The new checkpoint helper/package itself stays local; it is not a runtime dependency.
This deliberately does NOT produce a clean worktree or finish the cleanup checkpoint.

## 1. Preview (no source/docs/index writes)
From the project root:

    python .\tools\maintenance\feature_checkpoint.py

This writes ignored metadata reports to var/maintenance/feature-checkpoint-v1/, lists
exact proposed paths, held-back changes and an APPROVAL_SHA256. It never imports/runs
application code, starts/stops a server, reads .env/CV/database contents, runs tests,
changes feature flags, creates a Gmail draft or sends an email. Git optional index
refresh writes are disabled for inspection. Root must be the audited Git repository,
branch feat/review-provider-output and HEAD starting 2e12757. Existing staged changes
stop the helper; nothing is reset or unstaged automatically.

If branch/HEAD/source differs, STOP and review. There is no force/override switch.
No fresh full-project test result is implied. Git's own configured clean filters may
run during explicit staging, as with an ordinary Git add; no provider/email action
is part of this helper.

## 2. Review/apply dated documentation reconciliation
Read tools/maintenance/feature-checkpoint-v1/reconciliation.md first. It distinguishes
implemented source, user-reported small live flows and unverified work. It preserves
historical baselines without calling them current, keeps outstanding migration areas
open, and records browser isolation as an open validation gate.

To append it to the three existing formal documents:

    python .\tools\maintenance\feature_checkpoint.py --apply-docs

Only those three documents change. Audited baseline hashes are checked before writes;
backups go into ignored var/maintenance/backups/checkpoint-docs-<timestamp>/. It does
not modify application code, tests, either Playwright config, ignore rules or Git index.
It is idempotent; existing different reconciliations/manual doc changes stop safely.
The captured HEAD in the text is an audit reference, NOT a new commit identifier.

## 3. Make a fresh preview and review exact content

    python .\tools\maintenance\feature_checkpoint.py

Inspect plan.json and paths.csv under var/maintenance/feature-checkpoint-v1/.
Review tracked changes with your normal diff tools AND untracked source files in the
editor; git diff alone does not display their contents. Source text (54 known source/
test files) must match the uploaded audit after BOM/line-ending normalization. The
current .gitignore and repair utility are bound by their actual local byte hashes;
the audit did not include the latter's contents. Obvious token/private-key strings
block processing, but that pattern check is NOT a complete secret/PII audit. Inspect
for hard-coded credentials/private fixture data. No private runtime data is an allowed
path. Existing tracked private/generated paths also stop for separate review.

Do not use git add ., git add -A, git commit -am, git clean or index resets for this
mixed worktree. No cleanup deletions are included. Ignore-file hardening can be applied
separately using the previous helper; changing it requires a new checkpoint preview.

## 4. Optional, explicit staging — NOT a commit
Only AFTER reviewing the reconciliation, files and exact preview:

    $approval = (Get-Content .\var\maintenance\feature-checkpoint-v1\plan.json -Raw | ConvertFrom-Json).approvalSha256
    python .\tools\maintenance\feature_checkpoint.py --stage --approve $approval

This stages only the preview's changed allowlisted paths. It requires empty prior
staging, exact unchanged branch/HEAD/content/scope/held-back status, and the applied
reconciliation. A stale/missing hash refuses. It never stages deletions, uses force,
commits, pushes, rewrites history or clears a ledger. Concurrent Git/editor activity
should be stopped while staging. If unexpected changes are detected after Git add,
the helper stops for inspection; it does NOT clear/reset your index automatically.

A hash checks consistency, not whether a human has reviewed or deemed content safe.

## 5. Review before any manual WIP commit

    git diff --cached --name-status
    git diff --cached --stat
    git diff --cached --check
    git diff --cached

STOP if there is an unexpected path, deletion, secret, private fixture or unwanted
change. No automatic commit command is executed. After review, a suitable manual
message is: wip: checkpoint outreach and application review workflows
Record actual test results/known failures separately; this is not a release-ready
claim. Do not run the current full browser suite against the live port-3000 server;
first use a fixture server, temporary stores and fake/disabled live integrations.
Do not send real emails again merely to validate a Git checkpoint.

After a manual commit, unstaged tool deletions/local archives may remain: expected.
Clean checkouts still require private local configuration/templates/CVs by design.
Source checkpoint/rollback never restores an external email action or mail ledger.

## Verification performed here
Only disposable Git repositories, synthetic Git identities and captured source/docs
were used. Preview/index preservation, explicit 59-path staging, held-back deletions,
stale approval, wrong branch, missing/source-drift safeguards, prior staged-work
preservation, documentation failure restoration and BOM/CRLF/idempotency were checked.
No user's Git repository, Gmail, paid model, browser suite or live application-data
operation was run. This package does not assert a fresh application regression pass.
