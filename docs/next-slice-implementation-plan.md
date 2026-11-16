# Next slice implementation plan

Decision date: 1 November 2026. Status: AGREED SCOPE; implementation pending.

## Reading order and evidence boundary
Read this document with [architecture decisions](architecture-decisions.md), [existing slice roadmap](next-development-slices-roadmap.md), [existing implementation plan](IMPLEMENTATION_PLAN.md), and [overall architecture](../NewModularProduct-Architecture.md). This dated plan governs the next slice only; it does not declare the historical roadmap complete. Git documentation is the durable handoff, not chat or temporary generated archives. Inspect the current development source before implementation; Git, the local working tree, installation and runtime acceptance are separate states.

## Patch A: simple inspection and selection UX
1. Replace the Email background dropdown with native single-select radio buttons, readable labels and colour swatches. Reuse existing palette IDs, saved choices, theme endpoint and queue/MIME semantics. Selection previews both editors without altering letter content or making a paid call. Preserve save/version/action guards and keyboard/mobile accessibility.
2. Open the exact original PDF in a new browser tab from Inspect actual CV. Use the browser's PDF viewer. No iframe, embedded viewer, PDF.js, conversion service, OCR or new rendering dependency. Retain exact-original download and optional extracted-text inspection. DOCX behaviour stays unchanged.
3. Preserve review/CV authorization, controlled file-root access, expected file hash and no-store responses. Provide inline PDF delivery separately from attachment download. Browser settings may still download instead of viewing; retain the download fallback. Text-extraction failure must not be misrepresented as absence of the original PDF.
4. Review preview-specific response security headers deliberately; do not remove security protections globally. Use a user-activated link with a new-tab target and opener protection rather than an asynchronous popup.

## Patch A acceptance
- Existing palette selection survives reload; one radio selected; no paid/Gmail action on selection.
- New queue copies retain their frozen palette; existing drafts/history remain unchanged.
- Correct PDF opens from a valid reviewed CV; download still returns exact original bytes.
- Stale hash, expired review, disallowed CV and out-of-root paths fail safely.
- Browser and route tests use synthetic PDFs and isolated state; no real CV is committed.
- Deliver one coherent patch with source guards, tests, backup/rollback instructions and a status update. No production promotion without separate approval.

## Patch B: evidence-library quality
Audit one assignment first: challenge, diagnosis, alternatives, personal contribution versus team ownership, actions, outcomes, supported measures/timeframes, source/version, uncertainty and confidentiality. Add scenarios to fill coverage gaps, not duplicate similar claims. Preserve missing facts rather than inventing SMART details.

Permit multiple approved scenario selections rather than an arbitrary two-scenario cap. Inspect UI, server validation, request budget, cost proof and polishing instructions together. Show evidence-size/cost/word constraints and explain when selections cannot fit. Selection makes no paid call; provider submission requires the existing explicit cost approval. Library edits must not rewrite accepted letters, queued copies or history. Private source passages and user evidence remain outside Git.

## Status discipline
Record planned, in progress, tested in isolation, user-verified and released separately, with commit references and test evidence. No fresh test execution or implementation is claimed by this documentation commit. Research-derived email colours remain deferred. Prefer the smallest useful change; do not add infrastructure as a prerequisite.

## Patch A status (16 November 2026)
In progress: implemented and tested in isolation on branch `feat/patch-a-palette-pdf-preview` (radio buttons with swatches; `/api/cv-preview` inline PDF with hash, review and same-origin checks; download unchanged). User verification and release pending. Patch B not started.
