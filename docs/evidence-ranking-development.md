# Evidence ranking and review — development candidate

Date: 1 November 2026. Scope: local recommendation workspace on /evidence-library. Status: implemented and tested in an isolated candidate; NOT installed, committed or released by this work.

## Implementation
- New pure domain module src/domain/evidence/rank-evidence.js.
- New browser workspace src/interfaces/http/evidence-ranking-client.js, loaded by the existing assignment evidence HTTP page. Existing editor/save/export routes remain unchanged apart from serving the two additional JS assets and loading the workspace.
- Five capability profiles: AI delivery, Senior Manager, Delivery Leadership, Agile Coaching and Digital Transformation. Each offers evidence-intake questions; these are prompts, not claims about the user or verified scenario tags.
- JD drafting is a limited phrase-based local helper. It can miss requirements. Editable requirement wording, importance and matching phrases are authoritative after user review. No paid parsing, semantic model or vector store.
- Fixed initial weights: 55 requirements, 20 leadership scope, 15 outcome clarity, 10 context. User may amend nonnegative weights totalling 100. Score is a relevance aid, not ATS/hiring probability.
- Term hits are provisional at half strength, never proof. Scope/outcome/context default to unassessed/0, not inferred from title or metric size. User-reviewed positive matches need an exact quote from approved wording plus an explanation. Other reviewed components need explanatory notes. Review scores bind both scenario/assignment revision and requirement map.
- Current approval, provenance, evidence state and excluded-engagement checks gate eligibility. Restricted, unsupported, stale and incomplete records are excluded. Ranking uses approved wording, not private source passages or raw notes.
- Deterministic score order plus new-requirement coverage produces complementary suggestions. No automatic checkbox selection and no arbitrary two-item cap in this workspace.
- Private review download requires confirmation. It includes approved wording, assignment labels, versions and reviewer notes; review confidentiality before sharing. No provider payload or saved polishing-selection mutation.

## Architectural boundary
Browser -> existing local read-only library GET endpoints -> versioned saved assignments -> pure local ranking -> explicit human review. No writes, new database, schema migration, provider request, CV/letter rewrite, queue change or mail operation. Existing private data stays in existing storage; no actual evidence is added or invented by this candidate.

## Validation
17 policy tests passed. 7 real Chromium checks passed against the actual updated HTTP handler and CSP using a synthetic store and schema constants; the original editor script was omitted from that fixture. This is not a full editor/database regression or proof of current-user-checkout compatibility. All three source JS files pass syntax checks. Server baseline read directly from GitHub feat/review-provider-output, Git blob 99d66b1cde25d9c2571cdc168585eaa3ee148fa3, matched byte-for-byte before editing. No production action occurred.

## Remaining work
- Full editor and current-checkout integration regression before installation.
- Existing polishing path still enforces its two-scenario cap. This candidate does NOT remove that cap or submit selected recommendations. Change reference validation, evidence normalization, payload byte budget, cost proof/approval, prompt composition and UI together in a separate reviewed change.
- Real evidence population requires supported source material or explicit user confirmation. Use the intake questions and existing scenario editor; preserve confidentiality, uncertainty and ownership.
- Optional persistence/import of reviewer plans and integration with saved application selection are not implemented. Reviewer plans are page-local and can be downloaded privately; library approvals remain untouched.
- PDF new-tab and palette radios remain a separate agreed UX patch.

## Reproduce
node --test tests/application/evidence-ranking.test.js
python -B ranking-browser-acceptance.py
The browser fixture binds loopback only and uses synthetic data. It requires existing Playwright/Chromium; it does not install or download packages. The fixture must not be run as a production service.

## Git handoff
This document and source/test changes are prepared for one reviewed development commit. They are not yet pushed; repository writes require the explicit action confirmation. Future sessions should read this document with docs/next-slice-implementation-plan.md and docs/architecture-decisions.md once committed. Do not claim runtime acceptance from a Git commit alone.


<!-- optional-evidence-application-handoff-v2 -->
## Optional evidence hand-off v2 — 1 November 2026

The inspected local scenario policy already permits multiple scenarios and enforces a 128 KiB normalized approved-evidence budget. This supersedes earlier assumptions about a two-scenario cap. This extension preserves that policy rather than replacing it. The ranking hand-off reads the current server-advertised budget, measures the normalized approved JSON in UTF-8 and applies a conservative 16 KiB reference-request bound. No scenario is silently dropped or truncated.

Select a saved application explicitly (or enter the library from its contextual link), review ranked evidence, choose the desired scenarios, click Use selected evidence for this application, and confirm the exact target and approved excerpts. Current approval/revision/proof and saved-selection version are revalidated. Confirmation saves scenario-selection metadata only. Open the fresh application, review excerpts, and explicitly request a cost-approved polish, or Clear scenarios to polish without them. Existing letter, subject, CV and queue remain unchanged. Raw source passages and reviewer notes do not enter the polishing payload.

The installer updates browser code and this local documentation only, retains a backup and rollback, and does not commit Git or modify the scenario/cost policy. A recognized legacy two-checkbox UI guard, if present, is replaced by the server-advertised byte-budget check; newer picker guards are retained. Runtime user acceptance and full-application regression remain separate from isolated tests. Source rollback does not undo selections later confirmed by the user in the application.
