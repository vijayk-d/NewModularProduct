# Shared live CV library — implementation for both ports

Baseline: committed 0c4b291a3d714130d6575082b95fe72b15450318. This package adds one shared live catalogue editable from development 3000 and production 3100, with separate text indexes. It does NOT automatically deploy or change live configuration. Assignment evidence library is NOT enabled by this CV increment.

## EXACT extraction directory
Create D:\CV-Development-Deliveries\shared-cv-library\ and extract the ZIP CONTENTS directly there; no enclosing folder. Expected: install-shared-cv-library.mjs, README.md, installer.test.mjs, source-paths.txt and payload/. Do not copy payload over src manually.

## Stage A: source installation only
Preserve unsaved browser edits. Stop development normally; keep the existing production supervisor running.
Open PowerShell in the extraction folder:
```powershell
node .\install-shared-cv-library.mjs --root "D:\monorepo\NewModularProduct" --check
```
Only after CHECK PASSED:
```powershell
node .\install-shared-cv-library.mjs --root "D:\monorepo\NewModularProduct" --apply
```
The installer verifies seven committed file hashes, preserves originals and installs maintained runtime/setup/check/test/docs files. It refuses newer edits rather than overwrite them. No .env, shared catalogue, CV document, database, provider or production release is changed at this stage. No Git commit/push/deployment.

From the project root, using the existing project Node 24+ runtime:
```powershell
node --test .\tests\shared-cv-library.test.js .\tests\shared-cv-library-setup.test.js .\tests\cv-library-v1.test.js
```
Tests use temporary files, fake extraction and ephemeral local HTTP servers. No paid API or Gmail operation. Do not run unrelated live browser suites to test this feature.

## Stage B: REVIEW a private-data configuration plan
The proposed shared directory is D:\NewModularProduct-Shared\cv-library. Original PDFs/DOCX stay under the existing CV_FOLDER. Use the ACTUAL production root. The existing launcher defaults to D:\NewModularProduct-Production, but verify this file first:
```powershell
Test-Path -LiteralPath "D:\NewModularProduct-Production\shared\config\production.env" -PathType Leaf
```
If False, STOP and identify the actual production root; do not initialise a new production directory.
From the project root, using the correct production-root value:
```powershell
node .\tools\maintenance\shared-cv-library-setup.mjs --root "D:\monorepo\NewModularProduct" --production-root "D:\NewModularProduct-Production" --shared-dir "D:\NewModularProduct-Shared\cv-library" --plan
```
This is read-only. It validates production ownership, both modes/ports/CV_FOLDERs, source snapshot, old production inventory, role identity continuity and original-document availability. It prints counts, role-code conflicts, hashes and approvalSha256, not credentials or document text. If canApply is false, STOP and review missingProductionRoleCodes or unavailableRoleCodes; do not force/drop old production IDs or assume legacy_aliases redirects existing reviews.

The setup detects existing/partial/other shared libraries and refuses unsafe reseeding or redirects. A complete live catalogue is NEVER overwritten by a repository snapshot during re-setup/deployment.

## Stage C: apply ONLY a reviewed plan
Do not do this before Stage B is reviewed. Substitute the exact current approvalSha256:
```powershell
node .\tools\maintenance\shared-cv-library-setup.mjs --root "D:\monorepo\NewModularProduct" --production-root "D:\NewModularProduct-Production" --shared-dir "D:\NewModularProduct-Shared\cv-library" --apply --approve "PASTE_REVIEWED_APPROVAL_SHA256"
```
It seeds a new shared catalogue from the reviewed source catalogue once and writes ownership.json. It changes ONLY NMP_CV_LIBRARY_DIRECTORY and CV_INVENTORY_PATH in the private development .env and production.env. Every other environment value is checked for preservation; each old environment file is backed up beside itself with a .bak suffix. Backup paths/hashes are returned. No credentials are copied into shared catalogue storage. CV originals, old inventories, application databases, send ledgers and polishing flags remain untouched.

IMPORTANT: existing production is NOT restarted or hot-patched. Its old e0a3b7b release does not mount this new manager. Production starts using the shared library only after the new source is committed and delivered through the reviewed deployment workflow.

Restart development with start-local-server.bat. Open http://127.0.0.1:3000/cv-library and check the SHARED banner, count, Validate and Inspect. You can use the existing read-only preparation audit:
```powershell
node .\tools\maintenance\audit-cv-library-development.mjs --root "D:\monorepo\NewModularProduct"
```
No new Polish action is needed. Do not test a production-mode server manually on 3100 over the existing supervisor.

## Stage D: commit and production promotion
Review the exact source/test/docs/helper changes listed in source-paths.txt, commit/push, then use the existing production delivery procedure. The current stable 0c4b291 baseline remains in history. Do not edit the active release, reseed data, broadly add untracked delivery packages or disable deployment guards. Existing source-eligible untracked utilities may still require a separate decision before the launcher permits deployment; leave them untouched rather than git clean/reset.

Deployment verification runs in verification mode and ignores the real shared directory. The shared catalogue/index files are external reference data, not source assets to overwrite during code promotion or rollback. Per-save shared metadata backups are automatic. Existing application-database backup handling is unchanged; it does NOT automatically archive the external shared directory. Arrange secured off-device backup/snapshots of the shared catalogue/ownership/backups as part of reference-data recovery. Index text can be rebuilt and must remain private.

After a successful new production release, verify both environments:
```powershell
node .\tools\maintenance\check-shared-cv-library.mjs
```
Expected SHARED_CV_LIBRARY_ALIGNED, same revision, same counts and no selector discrepancies. This is a read-only local check: no extraction, indexing, providers or email. Old production returning Not found before deployment is expected, not evidence that development source installation failed.

## Expected paths and behaviour
Shared root:
- catalogue.json: live metadata
- ownership.json: private document-root binding
- catalogue-write.lock: cross-environment writer exclusion, never delete blindly
- backups/: content-hashed metadata snapshots before each save
- indexes/development and indexes/production: separate rebuildable extracted text, not Git data

Both UI and new application preparation use this same resolved catalogue, including production despite the legacy controller's old CV_INVENTORY_PATH override. Other open pages need refresh to load new choices. No automatic reranking of saved reviews, attachment replacement, draft approval, send or scheduling is introduced. Indexing does not change the existing score formula or repair old reviews.

Add registers an existing PDF/DOCX inside CV_FOLDER, not an arbitrary upload or CV generator. New/changed paths must be accessible before a shared save. Existing role IDs cannot be renamed/deleted through this UI. Role codes are capped at 60 characters to match preparation validation.

Concurrent saves use one shared metadata lock plus etag checks. Conflicting writers get a clear retry/reload error. Reindexing remains per-environment and refuses to publish a result if the catalogue changes during extraction. Security remains loopback/same-origin/per-process token/explicit confirmation; tokens from one port are not valid at the other.

## Repository snapshots without a second active catalogue
The tracked config/cv-library.json becomes a recovery snapshot, not a second live source. The UI Export catalogue snapshot link downloads metadata only. Alternatively, preview an explicit update of the tracked source snapshot:
```powershell
node .\tools\maintenance\shared-cv-library-setup.mjs --root "D:\monorepo\NewModularProduct" --snapshot
```
Only after reviewing its approvalSha256, repeat --snapshot with --approve EXACT_HASH. It backs up the prior tracked JSON, writes the reviewed metadata, and does NOT stage/commit/push. Review the diff and preserve it normally in GitHub. Private PDFs, extracted text, credentials and ownership.json do not enter the repository.

## Rollback
Source rollback does NOT restore private environment configuration or delete the shared catalogue. If disabling the shared feature, stop affected services safely and restore the TWO exact reviewed .bak environment files (or their prior CV settings) before returning to the old source. Do not replace any database or private directory. Preserve live catalogue/ownership/metadata backups so records added from production are not lost. Rebuilding code from an old snapshot must not reseed over newer live reference data.

For source-only rollback, with development stopped, from extraction folder:
```powershell
node .\install-shared-cv-library.mjs --root "D:\monorepo\NewModularProduct" --rollback
```
It restores seven exact original source files and removes only newly created feature files after hash checks; later source edits cause refusal. Retains all private config/data/caches. Do not blindly use source rollback while leaving new private pointers unreviewed; old startup/UI paths differ.

## Verification scope
TEST-REPORT.json describes the actual test environment. Source service and HTTP baselines were copied and Git-blob-verified for local execution; large startup/renderer edits are guarded and tested on anchor fixtures. Tests do not certify your real Windows filesystem/OneDrive extraction, whole application's regression suite or deployed production behaviour. The real local setup preview must be reviewed before writes. No paid API or Gmail call occurred when building/testing the package.
