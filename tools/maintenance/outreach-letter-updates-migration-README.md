# Reviewed additive outreach migration v1

Target: exactly outreach_letter_updates and outreach_letter_update_lock, with the six confirmed columns. No row deletes/updates, table rewrites, live Gmail calls, credentials, release promotion, Git operations or disabled deployment gates. Existing databases other than outreach.db are not opened by this utility.

## Extract and test
Extract this ZIP into D:\monorepo\NewModularProduct. It adds two Python utilities and this guide under tools/maintenance. The test uses synthetic temporary databases only:
python tools/maintenance/test_outreach_letter_updates_migration.py

## 1. Preview
Production may remain running for the check; if active records change before apply, the tool will stop and require a fresh check.
python tools/maintenance/migrate_outreach_letter_updates_v1.py --check --candidate 1bb2d8f8e4ade667d7ccd2b9d562e0f62d9864ae

Check compares the live schema read-only with the retained failed candidate probe. The delta must be EXACTLY the reviewed table and index. It backs up into a temporary COPY, applies the two DDL statements there, and verifies all existing table contents, schema and integrity. It saves a private checked plan under D:\NewModularProduct-Production\shared\migrations. No live schema or row changes occur in --check. Application contents are hashed locally, never printed; do not upload private plans/backups. A library, review-store or any unexpected extra schema change blocks the check.

## 2. Controlled pause
After CHECK PASSED, use Ctrl+C in the RUNNING production supervisor console to request graceful shutdown. Leave shared data, active.json and failed releases untouched. Confirm no listener on 3100 and no supervisor.lock before applying. The tool independently refuses an existing lock, live port or non-stopped status. Do not delete locks or force-kill processes to pass the gate.

## 3. Explicit production apply
Only after reviewing the two additions, run:
python tools/maintenance/migrate_outreach_letter_updates_v1.py --apply --confirm-additive-migration --candidate 1bb2d8f8e4ade667d7ccd2b9d562e0f62d9864ae

This command DOES modify the production outreach.db schema, intentionally and narrowly. It requires the same checked active release and unchanged source schema/record hashes. A fresh SQLite backup plus quick_check precedes a locked transaction. Inside it, the fixed CREATE TABLE and CREATE INDEX execute; all pre-existing rows are verified unchanged, the new ledger must be empty and integrity must pass. Any precommit failure rolls the DDL back. The backup is retained under shared/backups/outreach-letter-updates-v1-... and an applied receipt records the result under shared/migrations. Nothing overwrites an existing backup or receipt. No automatic retry or DROP rollback exists.

If data changed since preview, apply stops. With writers stopped, rerun --check, review, then --apply. If receipt writing fails after commit, do not repeat blindly: inspect the actual ledger/schema and backup first. The utility detects existing ledger objects and refuses to guess. Keep all migration records.

## 4. Restore service on the previous active release
In its production window:
& "D:\NewModularProduct-Production\start-production.bat"

Keep open, then verify from development:
python tools/deploy/local_delivery.py status
python tools/deploy/local_delivery.py health

The active commit is not changed by migration. If previous code cannot start, inspect logs; do not restore an old mail database automatically. The checked additive change is expected to be compatible, but real startup health remains a local acceptance gate.

## 5. New reviewed commit and release
The failed candidate path is retained and will not be overwritten. Commit this migration utility/tests as part of a NEW reviewed source checkpoint, rather than deleting the failed release. Stop development for release verification, generate/review a NEW plan, checkpoint it with the actual printed JSON path, push the resulting commit if desired, then deliver --ref HEAD through the unchanged deployment controller. The new commit uses a new release directory. The copied-production schema check must pass normally; do not weaken it or change storage-contract metadata to bypass it. If any further schema delta appears, stop and inspect it.

## Evidence and limitations
10 synthetic tests pass: preview no mutation, additive preservation, backup preservation, changed-data blocking, unexpected/partial-schema refusal, rollback before commit, partial-index locking semantics, supervisor-lock gate, private-data omission from reports. No live production migration, old-release restart, commit, push or deployment was executed by the assistant. The migration intentionally stores no synthetic test data in production.
