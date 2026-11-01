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
