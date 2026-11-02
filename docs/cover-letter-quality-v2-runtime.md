# Cover-letter quality v2.1 runtime increment — development opt-in

This is executable implementation, unlike the earlier design package. Not installed automatically. Not the whole v2 roadmap.

## Exact extraction location
Create D:\CV-Development-Deliveries\cover-letter-quality-v2-runtime\ and extract the ZIP CONTENTS directly there. The ZIP has no enclosing folder. You should see install.mjs, patches.mjs, manifest.mjs, README.md, installer.test.mjs and payload/. Do NOT extract payload over the application manually, and do NOT replace the entire src folder.

Target project: D:\monorepo\NewModularProduct\
Production is not modified. No .env is written by the installer. Stop development before applying code.

## Install and test without paid API calls
From the extraction directory:

```powershell
node .\install.mjs --root "D:\monorepo\NewModularProduct" --check
```
Only after CHECK PASSED:

```powershell
node .\install.mjs --root "D:\monorepo\NewModularProduct" --apply
```
The installer pins TWO inspected files: the refinement adapter Git blob 47b18638db973035d137331064738f477c1905ec and refinement-error-details Git blob 61bdf09a8010ee646d69de97558bf6b570cec81e from e0a3b7b baseline. CRLF/LF differences are allowed. Other source differences are refused. Do not force a mismatch or overwrite newer work.

From the project root, using the existing project Node.js 24+ runtime:

```powershell
node --test .\tests\cover-letter-quality-v2.test.js
```
These are local tests, no API/LLM/Gmail calls. The transport bundle also includes fixture integration/installer tests:

```powershell
node --test .\payload\tests\cover-letter-quality-v2.test.js .\installer.test.mjs
```
Run the latter from the extraction directory. Full application tests remain a separate required regression check before wider rollout.

## Explicit activation in DEVELOPMENT only
After local tests pass, add or edit ONE line in the project's PRIVATE .env:

```dotenv
ENABLE_COVER_LETTER_QUALITY_V2=true
```
Do not duplicate the setting. Leave all other settings unchanged. Restart with the existing start-local-server.bat. Mode must be development, port 3000 and host loopback. Production/verification ignore this flag even if mistakenly present. No UI/HTTP request can turn this on. The implementation is disabled by default.

Set the flag to false and restart to revert runtime behaviour without uninstalling. This also reverts the v2 source-permission extension. The original stricter upstream scenario/achievement selection checks remain in their current code.

Enabling does not call the provider. A normal explicit Polish action still makes the existing paid call; review the existing cost estimate again after activation. Model selection, web-search choice, existing output budget of 4096 tokens and complete-letter word caps are unchanged. The prompt/schema are larger/different, so the estimate must be refreshed; no promise of the same actual cost. Completion/truncation still fail closed. No automatic retries or token-budget increases.

## What actually changes when active
- A consolidated system policy replaces (not appends to) the legacy senior-policy string for this request path. Existing writing-reference/scenario controls and prompt JSON controls remain.
- The zero-to-two evidence-policy conflict becomes up to three, without forcing a quota. The fixed narrative-paragraph warning is removed from the SERVER proposal quality result; the separate browser editor's legacy counter is NOT changed in this increment.
- A request-scoped ledger adds source IDs, locations and hashes WITHOUT duplicating full CV text. Selected CV is primary. With explicit achievement selection, CV/profile allow capability claims only; achievements/results require selected A sources or approved S wording. Profile is corroboration, not sole proof. VALUES cannot become an outcome source. Previous drafts, templates and web research are not candidate-evidence sources.
- The existing response schema gains one nested evidenceAudit object. Existing response fields are retained. The audit covers up to eight priority requirements, up to twelve candidate-claim passages and up to five questions. It is not an exhaustive audit of every JD clause.
- Local validation rejects missing/incomplete/stale metadata; unknown IDs; invalid JD or source quotes; unaudited numeric outcomes; numeric claims mislabelled as capabilities; disallowed evidence permissions; changed percentages/currency tokens where recognised; and excluded source quotes. Numeric recognition is bounded: it is not a general natural-language fact checker.
- A few bounded heuristics flag possible added curriculum/academy, AI literacy, responsible-AI, confidence, qualifications or causal language. These are review flags, NOT comprehensive semantic detectors.
- Proposal warnings and review metadata carry CLQ-V2.1 and source-bindings-checked-human-review-required. SemanticVerification is false. Existing proposal-warning display is reused; there is no new source-inspector UI yet. If your screen does not display the warnings, do not assume a pass: UI verification is part of local acceptance.
- Existing protected composer, tone, advertiser relationship, exclusions, contextual highlight policy, word caps, manual acceptance and paid-call controls remain. No auto acceptance, email, scheduling, DB migration or source-CV update is introduced.

## What to assess in ONE optional live test
Use the same JD, selected CV, achievement selection, approved scenarios, tone, length and reviewed employer context as your comparison. Preserve the existing letter first. Explicitly request one polish only if happy with its refreshed estimate.

Check: (1) CLQ-V2.1 marker is visible in proposal warnings, (2) role-interest/evidence/alignment/three prospective focus areas/closing remain coherent, (3) no invented AI curriculum, AI literacy, confidence or responsible-AI claims, (4) metrics retain employer, assignment and outcome meaning, (5) transferable support and confirmation questions are honest, (6) invalid/incomplete responses do not overwrite your current draft. Do not accept automatically just because IDs/quotes passed.

This increment checks the immutable request snapshot, not the latest on-disk CV again at acceptance. The pre-existing upstream checks still run; a new full accept-time revalidation/source-inspector UI is deferred. A model can select a real quote that does NOT entail its paraphrase. Known IDs/numbers and schema conformity do not prove truth, correct causation, every employer association or complete claim coverage. Always review. No universal ATS score or interview guarantee is introduced.

## Maintained files and recovery
Modified: src/infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js; src/application/refinement-error-details.js.
Added: src/application/cover-letter-quality-v2.js; tests/cover-letter-quality-v2.test.js; docs/cover-letter-quality-v2-runtime.md; tools/maintenance/cover-letter-quality-v2/{install,patches,manifest}.mjs.

The installed helper/metadata stay under tools/maintenance, not the repository root. Commit and push reviewed source/tests/docs through the normal workflow; Downloads is not the maintained source. Do not commit .env, evidence text caches or .patch-backups. A fresh clone contains working runtime code; replaying a transport ZIP is unnecessary.

## Rollback
Stop development. From the extraction directory:

```powershell
node .\install.mjs --root "D:\monorepo\NewModularProduct" --rollback
```

It verifies both original backups and current managed-file hashes, restores the two modified files and removes only newly created feature files. It refuses later edits rather than discarding them. .env, personal data and source CVs remain untouched. If the private flag remains true after rollback it is unused by the restored legacy adapter; remove/set false manually if desired. Retain backups for review.

## Verification scope
See TEST-REPORT.json in the bundle. Tests use temporary fixtures/mocked schema and request handling, not your real private CV, real Windows browser, full application regression or a paid Perplexity call. Strict schema and prompt compatibility with the chosen live model still require the explicit live comparison. No live call was made by generating or testing this package.
