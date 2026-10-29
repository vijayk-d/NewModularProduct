# Stable development checkpoint — 29 October 2026

Status: CHECKPOINT CANDIDATE until local smoke checks, source review, commit and remote push are verified. Not a production-release or full-regression certification.

## Intended baseline
- User reported the quality-first polishing recovery working on 29 October.
- Experimental mandatory v2 evidence audit disabled; original writing prompt/contract restored.
- Model-specific low reasoning remains independent for OpenAI in development; no automatic retries or cap increase.
- CV library/catalogue and front-page navigation maintained in source. Earlier preparation-options audit showed 12 catalogue entries aligned; repeat only if source/data changed.
- Tampermonkey source exists under tampermonkey/. Browser-installed versions/settings are separate.
- Existing reference-letter library stores private Markdown outside the source/release tree.
- Small Save good example referrer/origin fix is a checkpoint candidate; record actual browser smoke outcome before claiming it passed.

## Acceptance evidence to record locally
1. Quality-first local request verifier: no required evidenceAudit; no evidenceContract in prompt; intended model-specific low reasoning retained. Do not incur a new paid call just to record these flags.
2. Existing accepted-letter prepare/review/save/resume behaviour; no automatic sending or overwriting good drafts.
3. Reference-origin regression test result plus browser staging/save/reopen of one private reference. Preserve unsaved edits before reloading.
4. Catalogue/source paths included in the intended Git scope; no secrets, CV originals, extracted text, databases, reference-letter bodies, output, logs or patch backups staged.
5. Actual focused test commands/results. Earlier reported counts are historical; do not claim a full suite passed unless it was actually run in an isolated safe environment.
6. Commit and remote push verified. Record the resulting commit ID/tag externally or in a later status entry, not as a self-referential commit hash inside this same commit.

## Repository preservation
Use the current local working branch; do not switch a dirty tree merely to match the old audited branch name. Review installed runtime source, tests, docs, approved config/cv-library.json and tools/maintenance helpers. Keep .env private. Existing commit-changes.bat intentionally does NOT push. Push origin and verify the commit/files on GitHub; a local commit alone is not laptop-loss protection.

Suggested commit subject: Checkpoint: quality-first polishing, CV library and reference save fix
Suggested optional tag after verified commit: dev-stable-2026-10-29-quality-first (do not overwrite an existing tag).

## Known limitations
- Restoring the pre-v2 writer does not guarantee perfect factuality; manual review remains necessary.
- Prior experimental model/schema compatibility failures are not all resolved; v2 remains inactive.
- Reference documents and application history need separate secured off-device backup. Git source does not restore private runtime data.
- Local deployment remains separate; no new production promotion/feature enablement is authorised by this checkpoint document.
- No broad cleanup/deletion of old utilities, captures or locks is part of this checkpoint. Consolidate documentation only after preserving the working source.

## Next milestone after preservation
Keep the writer stable. Use saved examples/synthetic regression fixtures for quality/cost checks without paid loops. Then deliver the previously approved local outreach archive and finish role/domain CV-building integration in small development-only increments.
