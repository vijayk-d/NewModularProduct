# Workflow presentation tidy — development candidate

Based on source capture 20261023T152432Z, source HEAD 1c641c4 plus its captured working-tree changes. This is not a production release.

Changes:
- After polish success/failure, focus and scrolling return to the polishing heading once the page finishes loading. Acceptance returns to the current-letter section; research, CV selection and role confirmation return to their relevant sections. The page still reloads. Resume pages do not steal focus.
- The real Perplexity system instruction now requires UPPER-CASE evidenced career employer/client names, without changing attribution, excluded-employer rules, URLs or prospective-employer names. This is a model instruction, not a guarantee that every provider response complies. No live API call was made.
- Signature composition no longer inserts a blank HTML line. Boundary-only empty blocks/breaks are removed; inline content gets a single break, block content no extra break. Internal signature images/tables/links/spacing stay intact. Plain text removes the extra blank line before the existing -- signature separator. Legacy signed messages still parse. Existing queued records, Gmail drafts and sent emails are not rewritten.

## Install on development
Extract ZIP into D:\monorepo\NewModularProduct. Stop development only; leave production running.
python tools/WorkflowPresentationTidy/install.py --root .
python tools/WorkflowPresentationTidy/install.py --root . --apply --verify

The first command is a non-writing source check. The second backs up originals and installs only the seven manifest files. It runs syntax checks and 150 focused tests. Failure restores scoped source. Mismatched source/repeated apply refuses rather than overwrite. No package installs or Git operations are performed. Restart development with your normal launcher.

## Browser replay (existing Playwright installation)
npx --no-install playwright test --config tools/WorkflowPresentationTidy/playwright.config.mjs
This configuration starts no normal application server: its tests create an isolated random-port in-memory server and inject fake provider results. It does not access production data or send email.

## Validation and release boundary
150 focused tests passed. An actual review-page Chromium check verified polish success/failure and acceptance focus with no page errors. The full captured suite produced 906 passes and 10 failures; the unchanged capture produced 895 passes and the SAME 10 failures. Captured fixtures/maintenance utilities/launcher/template files are incomplete, and some source-contract failures also occur in the baseline. See verification.json and both full logs; do not treat this as a green full-project baseline.
Do not auto-deploy this candidate. Run normal tests in the complete checkout, resolve baseline failures, inspect development, then checkpoint and deploy the exact reviewed commit with the existing local delivery workflow. The dirty tree contains other runtime dependencies: a commit of only these changes is not necessarily a self-contained release. Never blanket-stage backups/captures/secrets. No commit, push or deployment has been performed by this bundle.

## Rollback
Stop development, then:
python tools/WorkflowPresentationTidy/install.py --root . --rollback
Refuses if any scoped file has changed after installation. Restores original bytes and removes only the two new tests. No user-data or Gmail rollback is performed.
