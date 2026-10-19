# Slice 1 — Evidence-led preparation

Status: DEVELOPMENT CANDIDATE. Not deployed to production.
Baseline source capture: a219286dae282ec25be522919a1f1dbf3131c06c.

Implemented in this package:
- Inventory-backed role-code checkboxes and search, with the ten existing role entries supported dynamically.
- Explicit local CV loading, bounded achievement checklist, source context, method/measurement/duration indicators.
- Selection-derived letter evidence and an evidence-CV selection that keeps the full CV ranking list.
- Source-hash/ID validation at preparation and revalidation before polishing.
- Selection snapshots retained in the existing application's JSON payload; no SQL schema change.
- Three-column preparation field row, responsive stacking, source-supplied job-poster grouping.
- Existing applications remain readable; legacy manual-highlights API requests remain supported. New preparation forms are fail-closed: no checked achievements means no metadata achievement fallback.

Truthfulness boundary:
This version extracts candidate statements from CV passages; it does NOT fabricate missing SMART details or guarantee that a source claim is independently true. It does not infer current employer, date ownership, personal ownership of team results, or a delivery deadline from employment dates. Review each source context before selecting. Excluded-role/link/markup guards are conservative and can omit passages. If extraction yields no candidates, improve the source CV truthfully or select a different CV. No automatic paid model call occurs.

The saved achievement set is currently read-only on review. Start a new preparation to choose a different evidence set. The saved letter itself remains editable. Switching the review's selected CV retains the letter and highlights an evidence mismatch; polishing is blocked until evidence matches again. Existing queued snapshots are never rewritten by this feature.

Verification:
43 isolated automated checks passed locally, including the new evidence/client/read-only HTTP tests and existing preparation/evidence/generation regression tests. The full composed-server integration and real browser/real PDF workflows require verification on the complete Windows project. Use the packaged --verify and --browser commands before committing this candidate.

Next slice remains planned: floating navigation; review-grid/email-domain layout; adjacent Save/Delete; compact rating summary; single-select model/tone cards and new-application model default; contact toolbar relocation; wider sent-history subjects. Production Gmail enablement remains a separate explicitly approved configuration task.

## Revision 1.1: nullable form defaults

Missing form values are now normalised to empty strings before splitting. Omitted preferred-role codes and highlights cannot become the literal string null. Explicit unsupported codes are still rejected. Integration failures now report the response error summary. Targeted Windows verification is required; no production changes are made by this update.

## Revision 1.2: stable advert-field accessible name

The LinkedIn-load control wraps the advert input in a row. The advert input now explicitly retains the visible field name Job advert URL, independent of the adjacent button. The browser test verifies that exact accessible name before filling. No timeout increase, test skipping or weakened achievement assertions. Node and browser verification must pass on the complete project before release.
