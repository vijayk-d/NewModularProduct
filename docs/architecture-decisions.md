# Architecture decisions for current development

This is a dated supplement to [overall architecture](../NewModularProduct-Architecture.md), not a replacement for its historical sections. Pair it with the [next slice plan](next-slice-implementation-plan.md). Decisions below specify intended changes; they are not evidence of deployed functionality.

## ADR-001: original PDF in a new tab
Date: 1 November 2026. Status: user-selected design; implementation pending.

Context: the user wants to inspect the actual CV visually and explicitly prefers simplicity over an embedded/custom viewer. The captured implementation exposes metadata/extracted text and a hash-checked original-file download. Verify the current implementation before patching.

Decision: reuse controlled document access and original bytes. Add explicit inline-PDF delivery or a validated preview mode while preserving attachment download. The browser owns rendering in a new tab. Keep extracted text as an optional evidence/debug view, not a visual reconstruction of the PDF. No iframe, PDF.js, Office conversion or third-party document service.

Intended flow: browser Inspect action -> review/CV authorization -> original-file metadata and expected hash -> user-activated protected new-tab link -> bounded file adapter revalidates hash/root -> application/pdf with inline disposition -> browser viewer or browser-configured download. No absolute filesystem path in the public URL.

Boundary: UI and HTTP adapter change; domain generation, ATS scoring, CV content, selection and mail workflows do not. Preview and download must share file/version checks. Keep no-store and appropriate response security headers; preview-specific CSP changes require focused browser verification, not global relaxation. Retain a download fallback. Native-viewer appearance varies by browser; a uniform custom toolbar is deliberately out of scope.

## ADR-002: radio presentation over unchanged palette contracts
Date: 1 November 2026. Status: planned next patch.

Use native radio semantics for exactly one palette. Swatches supplement readable labels. Reuse saved theme identifiers, optimistic version checks, separate theme save and frozen queue/MIME metadata. No schema migration, letter rewrite or automatic provider call is justified by this presentation change.

## ADR-003: evidence-backed scenario reuse
Date: 1 November 2026. Status: next evidence review; existing contracts require audit.

Assignment/scenario content belongs in private evidence storage, not source-controlled docs. Git holds schema/contracts, sanitized examples, tests, architectural decisions and implementation status. Approved scenario versions must retain engagement attribution, source/version or explicit user confirmation, confidentiality and personal/team ownership. Missing measures or timeframes stay missing.

Allow multiple approved selections, subject to explicit request-size, cost and letter-length constraints, rather than a blanket two-item rule. Browser selection and library browsing are local operations. Only approved relevant excerpts enter an explicitly requested and cost-approved provider call. Retain versioned snapshots; later catalogue edits must not change accepted letters or existing mail snapshots.

## Documentation maintenance
Every subsequent functional patch updates the implementation plan and relevant ADR status in the same reviewed change. Read these files at session start and record the branch/commit used. Distinguish source presence, isolated automated tests, user acceptance and production release. Never store credentials, real CVs, private dossiers, databases or generated personal letters in Git documentation. No application, database or production change is part of this documentation commit.

## Status update — 18 November 2026
- ADR-001 (original PDF in a new tab): released (PR #26).
- ADR-002 (palette radio buttons): released (PR #26).
- ADR-003 (scenario reuse): unchanged; still the basis for Patch B.

## ADR-004: tailored CV as a copy of the owner's Word CV
Date: 17 November 2026. Status: released to master.

- **Context:** CVs must keep the owner's exact design; generated layouts were rejected. The owner's CVs have a Summary (sometimes untitled) and bullets under each employer, and usually no Key achievements section.
- **Decision:**
  - Copy the selected Word CV and replace only the Summary, each employer's bullets (same employers, same order) and an optional Key achievements section.
  - Unchanged lines reuse their original paragraph; edited lines copy the first bullet's style.
  - The result is re-read and compared with the approved wording before it is saved.
  - Figures must come from the same employer's original bullets or the selected evidence.
  - The base file is never written, and each build is a new version in `cv-tailoring-v1.db`.
- **Consequence:** layout fidelity without Office automation. Section detection is heuristic, so "Check all CVs" and per-CV heading choices are part of the design.

## ADR-005: per-CV choices are stored on the server
Date: 17 November 2026. Status: released to master.

The Word file chosen for a CV, and its headings, are stored in the `cv_preferences` table, keyed by role code, and reused by every application and the Export pack. The CV library stays the source of truth for which CVs exist, so adding or removing a CV needs no code change. Browser storage is used only for convenience choices (for example the export option).

## ADR-006: research once per organisation
Date: 16 November 2026. Status: released to master.

Organisation research runs automatically when the first application for an organisation is created. It is then reused for 30 days, across applications and page reloads. The research button always refreshes. The call is counted before it is made, capped per day, never retried, and errors are not cached. This replaced the rejected "research on every page load".

## ADR-007: files to keep are written by the app, not downloaded
Date: 17 November 2026. Status: released to master.

Browser downloads carry the Windows Mark of the Web, which makes Word block the file until it is unblocked. "Save to folder" writes the tailored CV and the Export pack's files directly into `APPLICATION_OUTPUT_FOLDER`. It never overwrites, and downloads remain available.

## ADR-008: robustness before new features
Date: 18 November 2026. Status: proposed.

Deliver the robustness packs in [robustness-review-2026-11-18.md](robustness-review-2026-11-18.md) (time limits, safe storage, crash logging, then a System check page) before the insights engine. Each is a small, separately shipped change that follows the existing rules.
