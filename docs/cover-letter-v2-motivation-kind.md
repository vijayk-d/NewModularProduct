# Motivation claim-kind correction: preserve the actual opening, correct the audit type

## Diagnosis
Reported claim: "I am interested in Answer Digital’s Lead Delivery Consultant role because it combines hands-on Agile delivery with helping teams and clients improve how they work."
The model labelled it prospective, but it is an expression of role interest plus a role interpretation. It is not a past achievement and not a future contribution plan. The v2 claim-type enum omitted motivation. Broadening future-framing vocabulary is not the appropriate fix.

## Exact extraction location
Create D:\CV-Development-Deliveries\cover-letter-v2-motivation-kind\ and extract the ZIP contents directly there. No enclosing folder. You should see install-motivation-kind.mjs, README.md, installer.test.mjs and payload/.
Stop development normally; leave production alone. Do not install the previous prospective-context candidate for this case; it was correctly refused and is superseded here.

## Check your existing captured response OFFLINE first
```powershell
node .\install-motivation-kind.mjs --root "D:\monorepo\NewModularProduct" --check
```
Run from the extraction directory, or use its absolute path. The check stages corrected CODE in a temporary directory, reads the existing bounded private capture and prints safe before/after results plus claim-type adjustments. It does not modify the capture, draft or repository and makes no API call. The raw quote/body is never printed.

If the check recognises the reported motivation and source baselines match:
```powershell
node .\install-motivation-kind.mjs --root "D:\monorepo\NewModularProduct" --apply
```
The installer repeats the offline check and refuses if no narrow legacy misclassification was identified. If a DIFFERENT audit issue appears, keep using the same captured response for investigation, not a new paid request. A remaining failure is not declared a successful letter.

From the repository root after applying:
```powershell
node --test .\tests\cover-letter-claim-kind.test.js
node .\tools\maintenance\replay-cover-letter-v2.mjs
```
Restart development through the existing launcher when resuming UI work. No new Polish action is required to assess the captured case.

## Actual runtime change
- Adds motivation to the v2 claim-type enum, and teaches the model that role interest is not a prospective plan.
- Pure motivation has no required candidate-experience source. If the model supplies evidence anyway, IDs, actual source quotes and exclusions are still checked.
- A narrow compatibility normalisation reclassifies already-captured prospective role-interest openings as motivation in the VALIDATED audit projection, without changing the raw provider response, saved capture, draftQuote or letter body.
- Records original/effective type and claim index in claimTypeAdjustments. Adds validatorRevision=motivation-kind-v1 and a visible warning. It is not a silent rewrite or independent semantic verification.
- The request wire version/source-snapshot hashing remains v2.1 so old permitted-source captures remain replayable; the backward-compatible enum extension is tracked separately as a validator revision. Evidence source permissions/identities and metric meaning rules are not relaxed.
- Motivation is narrowly recognised: role-interest opening, because + third-person role clause, no added first-person factual assertions, qualifications, budgets or metrics in that clause. A statement such as because I have led AI academies is NOT exempt; it must be split into an evidenced factual claim.
- Existing future framing remains for actual prospective contributions. Past achievements cannot be relabelled motivation to evade checks. Numeric-result guards remain. Profile-only candidate proof remains prohibited for factual claims.
- Role interpretation still needs JD alignment and human review. Classification of interest does not prove company facts or every role detail.

## No automatic actions
No model/reasoning/output-limit change, no .env change, automatic retry, sending, scheduling, acceptance or production activation. Existing quality-v2 development gate is unchanged. Offline evidence-audit success is not complete composer/highlight/length validation or semantic approval. The captured response is not automatically imported into the application.

## Persistence
Modifies only src/application/cover-letter-quality-v2.js. Adds src/application/cover-letter-claim-kind.js, tests/cover-letter-claim-kind.test.js, docs/cover-letter-v2-motivation-kind.md and a maintained helper at tools/maintenance/install-motivation-kind.mjs. Commit/push reviewed source/tests/docs, never private output/ captures or .env. The installer refuses newer/different source instead of replacing the whole file.

## Rollback
With development stopped, from extraction folder:
```powershell
node .\install-motivation-kind.mjs --root "D:\monorepo\NewModularProduct" --rollback
```
Rollback this layer before diagnostics, diagnostics before reasoning-low, then original v2 if needed. The uninstalled prospective-context candidate needs no rollback. Source edits after install cause refusal; private captures/data/config are preserved.

## Verification boundary
Bundled report records Linux pure/fixture tests, not Windows/browser/full-app or live-model verification. Your --check run uses the actual private capture locally. No new provider call was made to construct or test this package.
