# CV library: maintained source and recovery

The maintained implementation is the installed repository source, not a ZIP in Downloads.

## Commit scope
- config/cv-library.json (relative paths and metadata; no absolute legacy_source_path)
- src/infrastructure/cv-inventory/cv-library-v1.js
- src/interfaces/http/cv-library-v1.js
- src/interfaces/http/cv-library-v1.html
- src/interfaces/http/cv-library-v1.browser.js
- src/interfaces/http/run-local-server.js (development integration)
- src/interfaces/http/rendering.js (front-page link, if applied)
- tests/cv-library-v1.test.js
- tools/deploy/local_delivery.py (exact catalogue allowlist)
- tools/maintenance/preserve-cv-library.py
- tests/worker/test_cv_library_source_policy.py
- docs/cv-library-recovery.md

Review these actual working-copy files before committing; do not replace them with old remote files. The recovery note and policy test are installed by the persistence helper. Transport ZIPs, old installation backups and generated test reports are not required to run a fresh clone.

## Routine workflow
1. Test the changed source and inspect one real CV locally.
2. In GitHub Desktop, select NewModularProduct and review Changes on the CURRENT working branch. Do not switch a dirty working tree merely to match an example branch.
3. Select the intended source/catalogue/tests/documentation. Keep credentials, source CV documents, databases and extracted text out of the commit. Do not discard unrelated changes.
4. Commit with a meaningful message, such as "Maintain CV library, navigation and recovery documentation".
5. Push origin. A local commit alone does not protect against laptop loss. If GitHub requests fetch/conflict resolution, resolve and review it; never force-push or reset to bypass it.
6. Verify the commit and config/cv-library.json on GitHub in the branch you actually pushed. Record the commit identifier.

commit-changes.bat uses root_workflow.py and local_delivery.safe_source(). The persistence patch explicitly permits ONLY config/cv-library.json in the new top-level config folder. The root commit launcher still does NOT push. It may select other eligible changes; inspect its complete scope if using it instead of Desktop. The old feature_checkpoint.py has a historical hash-bound audit scope; do not reuse that frozen scope as if it automatically covered these new files.

The library editor changes a tracked working-tree file. Future catalogue edits must also be committed and pushed after review; there is no automatic Git commit/push from the browser.

## What stays private
- .env and OAuth/API credentials
- Original PDF/DOCX documents under CV_FOLDER
- output/cv-library-v1/index.json and catalogue backups
- Runtime databases, imported contacts and application history
- .patch-backups/, local logs and generated captures

Keep separate secured off-device backups for secrets, CV originals and non-rebuildable application data. The absolute CV_FOLDER belongs in private environment configuration. Use consistent database backups rather than assuming a live SQLite file copy captures all state. An index can be rebuilt from originals; lost application history cannot be recreated from the catalogue.

## Fresh-machine recovery
1. Clone the remote branch/commit containing the maintained implementation. Installing old transport patches should not be necessary.
2. Restore the supported Node.js 24+ / Python toolchain and project dependencies following the repository's existing setup and lock files. Node dependencies can be restored with npm ci; confirm all document-worker dependencies are available too.
3. Restore private environment configuration from secured backup. Set machine-specific CV_FOLDER and reconnect the original CV documents. Do not put credentials into tracked files.
4. Restore any required development/application database state from consistent private backups. Do not reseed or overwrite production stores.
5. Confirm config/cv-library.json exists. Preserve the deliberate distinction between the maintained catalogue and the currently active CV_INVENTORY_PATH: this increment did not activate it for ranking automatically.
6. Start development using start-local-server.bat. Open /cv-library, Validate, Inspect a real document, then Reindex all to rebuild missing private caches.
7. Run feature tests and a smoke check. A small feature unit suite is not a full application or Windows end-to-end certification.

## Tests
node --test tests/cv-library-v1.test.js
py -B -m unittest discover -s tests/worker -p test_cv_library_source_policy.py

The catalogue is now eligible for the existing source-selection/packaging function. Eligibility does not activate features or promote a release. Development-only gates stay in place; production promotion remains a separate reviewed workflow.
