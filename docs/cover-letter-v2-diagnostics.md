# Cover-letter v2 diagnostic correction: safe reason codes and optional private replay

This increment DIAGNOSES rejection; it does not weaken guards, fix an unknown evidence mismatch, guarantee provider compatibility, change model or make provider calls. Stop repeated paid retries until an exact reason is available.

The supplied GPT logs now show 1725/2500 output tokens and only 226/176 reasoning tokens, followed by local REFINEMENT_EVIDENCE_V2_REJECTED. The original output-cap failure is no longer the observed failure. The separate GLM HTTP 400 invalid_request lacks the provider's message. Neither the exact audit failure nor the GLM root cause can be established from the old logs.

## Exact extraction and installation
Create D:\CV-Development-Deliveries\cover-letter-v2-diagnostics\ and extract the ZIP contents directly there. There is no enclosing folder. You should see install-diagnostics.mjs, README.md, diagnostics-installer.test.mjs and payload/.
Stop development normally, leave production alone. From that extracted directory:

```powershell
node .\install-diagnostics.mjs --root "D:\monorepo\NewModularProduct" --check
```
Only after CHECK PASSED:
```powershell
node .\install-diagnostics.mjs --root "D:\monorepo\NewModularProduct" --apply
```

It checks the installed v2 module against its original maintained manifest, verifies the adapter/error formatter against their installed recipes (allowing the exact reasoning-low hotfix), backs up three edited sources and installs maintained diagnostics/replay/tests/docs. No force option. Stop on a mismatch; do not replace the src folder manually.

The installer does not edit .env or call Perplexity, Gmail or other services.

## Local tests: no paid calls
From the repository root:
```powershell
node --test .\tests\cover-letter-v2-diagnostics.test.js
```
The full application regression suite and Windows/browser smoke checks remain separate. Fixture tests are not a live-model test.

## Safe reason codes are available after restart
The existing web error gains a code such as CLQ_SOURCE_QUOTE, CLQ_SOURCE_PERMISSION, CLQ_DRAFT_PASSAGE or CLQ_SNAPSHOT_OR_COMPLETENESS. These are finite labels, not raw CV text. Provider errors gain a heuristic category (or UNCLASSIFIED), not a definitive inferred cause. Detailed provider messages are not printed in the normal log/page.
The code does not fabricate a reason for already-discarded responses. Historical failures cannot be captured retroactively.

## OPTIONAL private replay capture: explicit opt-in
Only if you want a future failed response captured, add/edit ONE private development .env line:
```dotenv
ENABLE_COVER_LETTER_V2_PRIVATE_REPLAY=true
```
The existing ENABLE_COVER_LETTER_QUALITY_V2=true must also remain active. Mode must be development on loopback port 3000. Restart using start-local-server.bat.

PRIVACY: evidence-failure capture contains the selected CV/profile text, JD, approved evidence, generated body and audit needed for exact local replay. Those are personal and possibly confidential data. It does NOT copy the .env, API key or Gmail credentials from configuration. HTTP-failure capture copies only bounded provider error details/model/status, not candidate request text. A provider error message is untrusted and may itself echo data; it stays private. Do not post, attach or commit the capture file.

Storage is exactly:
output/cover-letter-v2-diagnostics/last-failure.json

It is bounded to 1 MiB and the next captured failure REPLACES the previous capture. The repository currently ignores output/. No network calls occur during replay. Capture-write failure must not replace or hide the original provider/validation error.

If a controlled live diagnostic is explicitly approved by you: refresh the existing estimate, make ONE GPT polish attempt, and replay immediately if it fails. Do not keep retrying and do not then try GLM before replaying: a later failure would replace the capture. Do not repeat the GLM 400 merely to guess at causes. There is no automatic retry.

## Replay: no provider calls
From the project root:
```powershell
node .\tools\maintenance\replay-cover-letter-v2.mjs
```
It reads only the standard private capture and runs the CURRENT local validator. Output includes the saved timestamp, model, result and safe reason code/category, never the raw letter, CV or provider message. If no capture exists, it stops; do not create a new paid request just to run this command without a deliberate decision.

Share only the web-page Audit reason and/or replay SUMMARY. Do not upload last-failure.json. Once captured, a proposed validator correction can be tested against the same response repeatedly without paying for regeneration.

## What this changes
- cover-letter-quality-v2.js attaches a safe rule reason; ALL existing validation rules are retained.
- Refinement adapter captures failed evidence/provider results ONLY under opt-in and records a heuristic provider category for v2.
- refinement-error-details.js shows safe reason/capture status and category rather than discarding the distinction.
- Adds src/application/cover-letter-v2-diagnostics.js, tests/cover-letter-v2-diagnostics.test.js, tools/maintenance/replay-cover-letter-v2.mjs and this document.
- This installer is copied into tools/maintenance/install-cover-letter-v2-diagnostics.mjs for maintenance.
No raw evidence is printed in normal diagnostics. No automatic acceptance, request retry, output-cap increase, model change, application data reset, Git write or deployment.

## Rollback order and persistence
Stop development. From the extracted directory:
```powershell
node .\install-diagnostics.mjs --root "D:\monorepo\NewModularProduct" --rollback
```
Rollback this diagnostics increment BEFORE reasoning-low, and reasoning-low BEFORE the original v2 increment. Each layer intentionally refuses changed source rather than overwriting newer work. Rollback leaves private captures and .env intact for review. Set the private replay flag false and restart when collection is no longer needed. Do not force-add output/ or .patch-backups to Git.
Commit/push reviewed source, tests and docs through the usual workflow. The private capture is not maintained source. A fresh clone should not require replaying these transport installers.

## Known limitations
Exact-source binding can reject an output for several legitimate or illegitimate reasons; this patch exposes which rule fired, not whether that rule or the generated response is correct. Generic object shape/completeness codes may still require PRIVATE local inspection/replay. Current logs have discarded the old provider details. Request-category heuristics are not proof that the API rejected a particular field. The misleading refinement_completed event is not changed here; proposalWordCount=0 after failure is not success.
