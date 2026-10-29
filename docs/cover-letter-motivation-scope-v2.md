# Motivation scope v2: form-independent interest, separate quote-fidelity check

The reported claim 0 expresses interest in the role. Claim 3 expresses interest in its emphasis and working style. The previous isPureRoleInterest required a particular opening and because-clause and therefore rejected claim 3. This update does not require that sentence template.

## Exact extraction
Create D:\CV-Development-Deliveries\cover-letter-v2-motivation-scope\ and extract ZIP CONTENTS directly there; no enclosing folder. Expected: install-motivation-scope.mjs, README.md, installer.test.mjs, payload/.
Stop development normally; leave production alone. From the extraction folder:

```powershell
node .\install-motivation-scope.mjs --root "D:\monorepo\NewModularProduct" --check
```
The check stages corrected CODE in an automatically removed OS temp folder and replays your existing private saved response. It prints only safe results, classification counts and exactBodyMatch flags. No provider call, repository change or raw CV/letter output.

If the source checks succeed and the comparison shows the new motivation assessment, apply:
```powershell
node .\install-motivation-scope.mjs --root "D:\monorepo\NewModularProduct" --apply
```
Do not force a baseline mismatch. A different remaining audit rejection is not a successful full letter; investigate the SAME capture without new paid calls.

From the project root after applying:
```powershell
node --test .\tests\cover-letter-motivation-scope.test.js .\tests\cover-letter-claim-kind.test.js
node .\tools\maintenance\replay-cover-letter-v2.mjs
```
Restart normally before returning to web UI use. No new Polish request is needed for this comparison.

## Scope and limits
- Recognises interest/alignment throughout a sentence, including The emphasis ... appeals to me, not just I am interested ... because it ... .
- Positive personal factual assertions, qualifications, financial/numeric material and genuine future plans retain their separate checks. An interest label is not a way to hide achievements or credentials.
- Unfamiliar non-factual wording receives an explicit manual-review warning rather than a grammar-form veto. Source/quote/metric guards still run; this is not independent semantic verification or automatic acceptance.
- Quoted audit text must STILL locate its exact body passage. The supplied pasted paragraph shows practicesparticularly while its audit quote shows practices particularly. This could be a paste artefact; exactBodyMatch checks the saved data. The patch does not silently change whitespace, draft wording or the raw capture to hide a mismatch.
- If exactBodyMatch is false and whitespaceInsensitiveBodyMatch true, the content differs at least in whitespace; it remains rejected under the existing exact-quote rule. Share only safe comparison fields, not the capture.
- Does not change model, reasoning, token cap, .env, production, CV originals, scheduling or acceptance. No automatic retry or paid call.

## Maintained source
Modifies src/application/cover-letter-claim-kind.js and two targeted lines in src/application/cover-letter-quality-v2.js. Adds tests/cover-letter-motivation-scope.test.js, docs/cover-letter-motivation-scope-v2.md and tools/maintenance/install-motivation-scope.mjs. Original runtime tests are not removed or replaced. Review/commit/push source; do not commit output/ private captures, .env or .patch-backups.

## Rollback
With development stopped, from extraction folder:
```powershell
node .\install-motivation-scope.mjs --root "D:\monorepo\NewModularProduct" --rollback
```
Rollback this layer before the earlier motivation-kind layer, then diagnostics, reasoning-low and original v2 as needed. The refused prospective-context candidate was never installed and needs no rollback. Later edited source causes refusal. Private configuration/data/capture remain untouched.

## Verification boundary
Local pure and temporary-fixture tests are recorded in TEST-REPORT.json. No actual Windows browser, complete application suite or live model evaluation was performed here. Your installer comparison reuses the actual capture locally. A passing evidence audit does not run every downstream composer/highlight/word-limit check and does not approve/import/send the captured letter.
