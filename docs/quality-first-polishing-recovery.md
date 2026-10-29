# Quality-first recovery: restore the writer, stop blocking on v2 audit

This is a recovery, not another semantic classifier/quotation fix. The v2 blocking evidence audit is experimental and has generated repeated rejections. Restore the existing pre-v2 system prompt and response schema by setting its PRIVATE development opt-in false. Keep the useful model-specific low-reasoning control independent of that experimental flag so OpenAI does not return to the prior reasoning-only output-cap failure.

## Exact extraction
Create D:\CV-Development-Deliveries\quality-first-recovery\ and extract the ZIP contents directly there. No enclosing folder. Expected: restore-quality-first.mjs, README.md, recovery.test.mjs, payload/.
Stop development normally; leave production alone. From the extraction folder:
```powershell
node .\restore-quality-first.mjs --root "D:\monorepo\NewModularProduct" --check
```
Only after CHECK PASSED:
```powershell
node .\restore-quality-first.mjs --root "D:\monorepo\NewModularProduct" --apply
```
It verifies the actual installed adapter by reversing the recorded diagnostic/v2 edits in memory and checking the original Git blob 47b18638db973035d137331064738f477c1905ec. It preserves the exact prior bytes for rollback. Stop on any source mismatch; no force option. The v2/motivation modules are not deleted or promoted to production.

## Switch the PRIVATE development profile
After applying, edit existing values (do not duplicate them) in D:\monorepo\NewModularProduct\.env:
```dotenv
ENABLE_COVER_LETTER_QUALITY_V2=false
ENABLE_COVER_LETTER_V2_PRIVATE_REPLAY=false
```
Leave CV_FOLDER, CV_INVENTORY_PATH, credentials, model catalogue, word caps, Gmail settings and all other flags unchanged. No new key, model migration or production configuration change is needed. The installer itself never edits .env.

Before a paid call, run from the repository root using the supported project Node.js 24+ runtime:
```powershell
node .\tools\maintenance\verify-quality-first-polishing.mjs
```
This builds an actual request with SYNTHETIC data and prints only the profile/schema flags, model and cap. It reads only configuration values needed for the profile; no secret values are printed. It does not call refine(), fetch(), Gmail or the provider. Expected: requiredV2Audit false; v2EvidenceContractInRequest false; reasoningEffort low; providerCallsMade 0. The existing 4096 output-token cap is not raised. If this fails, do not pay for another attempt; share its safe summary.

Restart development through start-local-server.bat. This does not prove high letter quality: it restores the pre-v2 writing mechanism and allows controlled evaluation. Do not repeat prior paid calls simply to confirm a configuration change.

## What is restored/preserved
With v2 false: original senior cover-letter instructions and original structured response, without requirementAssessment/claimAudit as mandatory output, CLQ sentence-form checks or exact-JD-quotation rejection. Existing role focus, selected evidence restrictions, approved scenarios, protected closing, tone, manual acceptance, exclusions, length limits, completion/JSON safety checks and cost controls remain. Core completion and candidate-safety checks must not be bypassed just because v2 is off. No automatic sending/scheduling, no database reset, no change to source CVs or current accepted letters.

The small request change keeps reasoning.effort=low for exact model openai/gpt-6-luna ONLY in loopback development on 3000, independent of v2. Production/verification/other models are unchanged. Model selection and the output cap stay the same. Estimates must be refreshed before a user-authorised live comparison, and completion is still required. This is not a guarantee the selected provider/model will succeed or write the best letter. Do not switch to the GLM model that returned HTTP 400 without understanding that separate request error.

## Quality and cost policy going forward
The job is writing a persuasive truthful letter, not producing an extensive audit transcript in the same completion. Keep the approved five-part outreach structure and source factual restrictions. Avoid mandatory schema fields that force the writer to invent labels, source quotations or extra paragraphs. A requirement paraphrase mismatch is not proof that the draft is bad or contains invented candidate facts. Conversely, do not treat a model-invented quotation as a true JD passage.

Hard rejection: incomplete/no usable result, malformed response contract, unsafe placeholders/markup/links, excluded evidence where detected, protected-section failures and configured caps. Semantic fit, motivation grammar, exact JD rephrasing and uncertain transferability belong in clearly labelled review information, not a silent rewriting rule or a paid retry loop. Existing prompts still prohibit invented candidate claims; no automatic local checker guarantees factuality.

Optional evidence analysis should later run in non-blocking shadow mode on saved results, with local source-span IDs instead of asking the model to retype JD passages. It must demonstrate benefit against accepted letters before affecting production writing. No second paid critic, automatic retry, extra company research, extra model or token-cap increase by default. Preserve/reuse reviewed employer context; use the existing explicit web-search control and user approval rather than silently toggle it.

Evaluation sequence: preserve last good letters and inputs; compare mocked/offline behaviour; perform one optional deliberately approved live comparison only when local verification passes; review truthfulness, relevance, natural prose, structure, edit effort, successful-generation rate and actual cost per accepted letter. Do not present this as universal ATS scoring. Commit/push a consolidated working baseline after acceptance; future recovery should use source, not replay this patch history.

## Persistence and rollback
Modified: src/infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js (one reasoning-scope expression).
Added: tools/maintenance/verify-quality-first-polishing.mjs, docs/quality-first-polishing-recovery.md and tools/maintenance/restore-quality-first.mjs. Retained inactive experimental code and private capture are not deleted. Review/commit/push source/docs, not .env, output or .patch-backups.

To undo THIS recovery source change, stop development and from extraction directory:
```powershell
node .\restore-quality-first.mjs --root "D:\monorepo\NewModularProduct" --rollback
```
Rollback leaves .env untouched. IMPORTANT: if you reverse the source patch while keeping v2 false and continue using the OpenAI model, low reasoning again becomes tied to v2. Do not blindly resume paid calls; review configuration. Later adapter edits cause refusal rather than overwrite. Roll back this source layer before trying earlier adapter-layer uninstallers.

## Verification limits
Bundled report covers Linux pure/fixture tests. Real application request-shape verification is provided for YOUR current local source without provider calls. Windows/browser/full-app regression and actual quality improvement are not certified by generating this package. No live call is made by installation or the local verifier.
