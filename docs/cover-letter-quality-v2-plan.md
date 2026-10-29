# Cover-letter quality v2: implementation plan

Status: reviewed design package, not an installed API/prompt change. Development port 3000 only. No paid request, repository write, environment change, automatic acceptance or production promotion was performed to create this package.

## Inspected baseline
Repository vijayk-d/NewModularProduct, feat/review-provider-output, previously inspected e0a3b7b baseline. Key modules: src/infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js; src/application/senior-cover-letter-instructions.js; src/application/role-focused-letter-policy.js; src/application/structured-letter-policy.js; src/domain/cover-letter/letter-quality-policy.js. Integrate against the current committed working version before editing: newer laptop-only CV modules must not be overwritten by an old remote baseline.

## Findings
Existing prompt already protects evidence selection, attribution, metrics, role focus, exclusions, advertiser relationship, prospective wording and the locally composed closing. Do not pretend these safeguards are missing or build a second generator.

Missing or inconsistent elements:
1. API schema audits selected highlights, not every substantive candidate claim.
2. validateProposal returns review.strengths, risks and unsupportedClaims as empty arrays rather than a completed evidence assessment. Empty must not be interpreted as checked and safe.
3. roleFocusPolicy says select zero-to-two examples; structure requests up to three. Consolidate the rule in one policy: up to three, two-to-three desired only when supported.
4. assessLetterQuality counts blank-separated blocks and warns outside 3-4 narrative paragraphs, while the requested structure includes bullets, motivation, alignment, prospective contribution and protected sections. Assess section presence/repetition/budget rather than impose that blanket count.
5. The title-based profile for a Data & AI Learning Consultant falls through to role-specific. Add a substantive-JD-aware learning-consultancy policy hint without asserting that the candidate has the required expertise.
6. Multiple layers repeat instructions; consolidate ownership rather than continually appending paragraphs. Keep contextual highlighting distinct from factual claim validation.

## Pipeline
Confirmed vacancy -> fresh permitted evidence snapshot -> requirement/evidence map -> one user-authorised polishing call -> schema and local binding checks -> semantic issues surfaced -> side-by-side human review -> explicit acceptance. A second paid critique is optional and separately approved, not automatic.

## Step 1: freeze regression cases before changing prompt
Use the synthetic fixture JSON supplied here plus the QA learning-consultant exchange as a private/manual evaluation case. Test positive paraphrases as well as hallucinations. Do not copy whole personal CVs, private scenario notes or credentials into committed fixtures. Preserve an example of the current generated letter and record prompt/model/source versions privately.
Acceptance: current behaviour reproduced; expected unsupported additions are identified without creating arbitrary ATS/interview probabilities.

## Step 2: build a permitted evidence ledger locally
Assign stable evidence IDs from the selected/approved sources. Store source type, canonical text hash, raw document hash where available, exact approved passage, known employer/client/assignment attribution, recorded action/ownership and metric meaning/unit/timeframe. Distinguish documented values from unknown values. The ledger cannot invent structure absent from the source: ambiguous assignment or causation requires confirmation.

Full selected CV text can corroborate selected achievements but cannot silently authorise unchecked claims when explicit selection is enabled. Approved scenario wording is the only permitted scenario text; private notes/source passages remain private. Previous drafts and reference letters are style context. Research establishes employer context, not personal experience.
Acceptance: immutable source snapshot for each request; changed evidence invalidates the proposal before acceptance; excluded employers and empty explicit selection stay protected.

## Step 3: map substantive JD requirements
Use confirmed title and JD responsibilities. Classify support as direct, transferable, not_evidenced or needs_confirmation. These are assessments of the supplied evidence, not assertions about the candidate's whole career. A keyword match cannot establish direct experience. Separate mandatory/desirable/unspecified; do not invent employer knockout rules.
For QA: delivery coaching and competency frameworks may be transferable; formal diagnostics, AI curriculum design, technical data-science teaching, learning portfolio ownership and bids require their own evidence. Do not assert a gap is real until all permitted material has been reviewed.
Local code checks IDs, quoted spans and versions. Semantic interpretation uses the authorised model response and human review, not a naive local keyword classifier. In the initial implementation, the same paid response returns this map with the draft, so it is not an independent review. If a later interactive evidence map is wanted before drafting, make any extra call explicit and costed.
Acceptance: each mapped claim has a JD quote and permitted evidence IDs, or an explicit limitation/question. Cap output responsibly; if assessment cannot be complete, mark it incomplete rather than silently omit requirements.

## Step 4: consolidate the prompt
The supplied candidate prompt is a proposed unified policy, not an append-only replacement. Preserve all existing controls: current selected model, tone, confirmed application role, exclusion rules, advertiser relationship, uppercase evidenced employer presentation, plain-text bullets, protected opening/closing, current date, no raw links/HTML, scenario approval and reduced body/complete-letter budgets.
Input envelope should carry: contract/prompt version; confirmed vacancy/JD; source fingerprint; evidence ledger; permission restrictions; candidate-approved values; reviewed employer research; writing examples labelled style-only; prospective focus-area policy; protected section ownership; existing tone and budget settings. Do not send the entire CV library to solve one letter or bloat the prompt with cached text. Keep initial generation one explicitly authorised call. Preserve the user's web-search choice; new research suggestions must not become unreviewed employer praise.
Acceptance: a single instruction owner per rule and no contradictions about bullet counts, highlights, structure or budget. Preserve non-AI role focus and direct-conversation/redirection closing.

## Step 5: extend, do not replace, the response contract
The response-extension JSON adds six fields plus a policy version. Merge its properties and required keys into the EXISTING complete schema. Retain proposedDraft, warnings, research IDs, suggestions and contextual highlight fields. It is not a complete API response schema or a live request. Use explicit properties/additionalProperties:false at every object. Validate completion and truncation before trusting any response.
New fields: qualityPolicyVersion, assessmentComplete, requirementAssessment, claimAudit, confirmationQuestions, omittedEvidenceIds, assessmentLimitations.
claimAudit quotes the generated BODY; protected composer text is added later, avoiding broken offsets. Validate mappings before composition and final structure/budget afterwards. Requirements max 12, claims max 20 and questions max 8 are proposed bounds for initial evaluation, not a licence to silently omit claims. Shorten the proposed narrative or flag incomplete assessment if bounds prevent coverage. No chain-of-thought is requested: only concise support explanations.
Acceptance: old consumers still receive their existing fields; the UI represents not_assessed/partial/passed_checks/review_required distinctly, not an unconditional empty unsupportedClaims array.

## Step 6: local validation and human review
Hard checks: completion, parse/schema, known IDs, exact source quotes, quotes actually present in draft body, current hashes/permissions, excluded sources, protected sections, length and explicitly approved identity/metric bindings. Parse ordinary numeric variants carefully; future 3-6-month wording and job reference numbers are not past-result metrics. Do not infer new baseline budgets from a percentage saving.
Semantic review flags: new causation, inflated ownership, changed outcome meaning, changed audience, assumed teaching/qualifications, inappropriate cross-employer association and generalised statements implying evidence across all employers. The model's own IDs and self-audit are not proof of entailment; exact quote/number matching alone cannot solve factuality. Uncertain semantic claims stay review-required. Do not claim these checks guarantee truth.
Hard failure or incomplete result preserves the user's existing letter. Invalid proposals may be quarantined separately for inspection but are not silently accepted. A reviewer can correct an issue or supply new evidence; the UI must not label an unsupported claim verified merely because a warning was dismissed. No automatic paid repair/retry, sending, scheduling or acceptance.
Acceptance: no silent downgrade of checks and no overwriting of a good draft when a proposal fails.

## Step 7: UI, evaluation, rollout and persistence
Show letter + JD support table + claim/source inspector + confirmation questions + meaning-changing diffs. Flag unsupported additions, not just ordinary word changes. Keep source IDs and warnings out of the recruiter-facing letter. Label internal evidence coverage honestly, not an external ATS score or hiring probability.
Evaluate: unsupported claim introduction; correct employer/metric attribution; direct-versus-transferable classification; role-specific relevance; repeated/irrelevant achievement use; protected closing fidelity; readability/section presence; within-budget output; user edits needed; latency and actual reported cost. Prioritise zero unsupported metric/employer/qualification assertions in the labelled regression set over prettier wording. This is a bounded test target, not a universal safety guarantee.

Run in order: pure/mock tests -> browser checks -> synthetic role regressions (Agile/Scrum, AI learning, AI adoption, programme management, agency/unknown, sparse evidence) -> one explicitly approved live comparison against v1 -> review cost/quality -> development opt-in -> normal source commit/push -> separately reviewed promotion. No automatic model changes, .env changes or production activation.

Proposed maintained locations: existing prompt/adapter/policies for integration; new pure evidence-contract/claim-audit modules under src/application only if needed; response and acceptance tests under tests; documentation under docs. Transport artifacts are temporary. Add source/version/hash information to the existing proposal audit trail rather than log raw CV text or introduce another full-text database. Clone-based recovery must reproduce the mechanism without old ZIP installers.

## Deliverable status
This package contains the plan, candidate consolidated prompt, response extension schema, one shape-validation example and 12 labelled synthetic acceptance cases. JSON Schema structure and example were checked locally. No semantic detector, live model output, integrated test suite, deployed prompt or production mechanism is claimed to be implemented by these documents.
