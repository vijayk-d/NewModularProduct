# Save good example: development same-origin form fix

## Cause and security boundary
The existing visible-text button submits an HTML form to /cover-letter-library in a new tab. The application page is sent with Referrer-Policy: no-referrer. For navigation-mode form POSTs this can make the browser send Origin: null, which the library's strict Origin guard rejects. This is consistent with the reported error; actual browser request headers were not inspected remotely.

This patch changes only sendHtml's DEFAULT referrer policy to same-origin when NMP_ENV is development (or default), PORT is 3000 (or default), and HOST is loopback. Production/verification/other bindings retain no-referrer. Same-origin sends referrers only within the same origin, not to external sites. Explicit caller header overrides still win.

No CORS wildcard, no allowance for null Origin, no disabled CSRF/Origin check, no host alias/port equivalence and no new server write endpoint. The existing two-step flow remains: stage visible text in a separate editor; save the private Markdown only after explicit review and confirmation. No provider/Gmail call.

## Exact extraction directory
Create D:\CV-Development-Deliveries\reference-origin-fix\ and extract the ZIP contents DIRECTLY there; no enclosing folder. Expected: fix-reference-origin.mjs, README.md, installer.test.mjs, payload/ and TEST-REPORT.json.

Before stopping/reloading, preserve any unsaved cover-letter edits locally. Stop development normally; leave production alone. From that extracted directory:
```powershell
node .\fix-reference-origin.mjs --root "D:\monorepo\NewModularProduct" --check
```
Only after CHECK PASSED:
```powershell
node .\fix-reference-origin.mjs --root "D:\monorepo\NewModularProduct" --apply
```
The installer pins responses.js Git blob af49daf114ae74964476f4dcd2307d8674d25b0d, tolerating LF/CRLF only. Other changes cause refusal; do not replace the entire file or force it. .env, CVs, existing private Markdown references, databases, polishing prompts/model/cost controls and production are untouched.

## Local tests and browser smoke check
From the project root:
```powershell
node --test .\tests\cover-reference-origin-regression.test.js
```
Restart through start-local-server.bat. RELOAD THE ORIGINATING APPLICATION/REVIEW PAGE after preserving unsaved text; an already open old document keeps its prior response policy. Do not only refresh the error tab.

Optional header check (read-only, no JavaScript/provider execution):
```powershell
(Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:3000/").Headers["Referrer-Policy"]
```
Expected same-origin.

Click Save as good example on an existing letter; no need to polish again. Confirm a separate library editor opens with the current visible text, including an unsaved test edit. Nothing should be saved yet. Review/redact, enter a title/tags, tick confirmation and save ONE reference. Refresh the library and confirm it can be reopened. No application/queue/Gmail state should change. The private reference data are NOT repository source.

## Stable development checkpoint
See docs/stable-development-checkpoint-2026-10-29.md added by this package. Preserve the user-accepted quality-first recovery and current CV-library implementation in the LOCAL working-tree source; do not overwrite it with the older remote e0a3b7b snapshot. Review/commit intended source/tests/docs/catalogue with GitHub Desktop or the existing reviewed commit workflow, then PUSH origin. No commit/push/deployment occurs in this installer. No blanket git add, reset, cleanup or force-push.

## Rollback
Stop development. From the extraction directory:
```powershell
node .\fix-reference-origin.mjs --root "D:\monorepo\NewModularProduct" --rollback
```
It checks current/backup hashes, restores original response helper and removes only files created by this increment. .env, saved private references and other data are retained. Later edits cause refusal rather than overwrite.

## Test limitations
The delivered local tests exercise the exact inspected response-helper bytes, HTTP header behaviour and a focused unchanged library guard/form-stage fixture. Installed tests import the application's actual library handler. A real Windows/browser smoke check is still required; Node fixtures do not emulate browser Origin generation. No full application suite or production deployment was run here.
