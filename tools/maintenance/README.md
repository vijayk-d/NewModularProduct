# Development CV-library alignment audit

Place audit-cv-library-development.mjs in tools/maintenance/ in the development repository. Keep audit.test.mjs beside it if you retain the tests. Both are maintainable source under the existing tools/maintenance policy; commit and push reviewed additions.

With your existing Node.js 24+ runtime, from the project root:

node tools/maintenance/audit-cv-library-development.mjs --root "D:\monorepo\NewModularProduct"

This reads the development .env but prints no credentials or complete environment. It compares the maintained catalogue against the live /api/preparation/options endpoint on loopback port 3000. It does not read original CV documents, the private extracted-text index, saved reviews or databases. No files are written by the audit; there are no provider calls, Gmail operations, memory tuning or production requests.

It checks missing/new IDs, stale role names, unexpected IDs, document-configured flags, and whether CV_INVENTORY_PATH on disk resolves to the maintained catalogue. It cannot prove that the already running server loaded a recently edited .env. A restart may be required after configuration changes. Matching role choices does not establish indexed text/ATS scoring freshness and does not rerank existing reviews.

The helper rejects production release folders, non-development mode and non-3000/non-loopback configuration. Catalogue and response reads are bounded to 1 MiB. Six pure/fixture tests passed locally on Node v20.20.1; the live user's Windows process was not accessed.

PREPARATION_SELECTOR_ALIGNED means only the checks above match. ALIGNMENT_REVIEW_NEEDED lists discrepancies. Do not reset databases or delete caches to fix a catalogue-path discrepancy.
