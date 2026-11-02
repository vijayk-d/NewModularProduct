# Generated-list spacing v2

Scope: remove stacked AUTOMATIC spacing around newly converted generated lists, without a global letter rewrite.

- Repeated br runs (two or more) directly bordering newly generated lists are removed; a single explicit separator remains.
- Blank paragraphs directly bordering newly generated lists are removed.
- Adjacent generated bullet items already group into one list, without blank items.
- Editor list/item/list-paragraph default margins are set to zero. No font, template margin, line-height or ordinary-paragraph margin is changed.
- Existing native lists are NOT structurally rewritten: explicit blank paragraphs/br breaks remain. Their default CSS margins are reduced. Manually unbulleted prose remains unbulleted. No migration or forced save occurs.

This fixes known list-boundary padding, not every blank line in every saved letter. If gaps remain in an already-saved native list, identify actual empty blocks before deciding whether to delete them. This patch does not flatten manual paragraph spacing or change PDF integration.

Apply only after the generated-bullets v1 and template/list-style v1 increments. The v2 installer pins both installed source baselines. New helpers record their own state; use THIS installer for status after v2. The older v1 installers will see expected later edits to their managed files. Roll back v2 before attempting to roll back either parent increment.

Local tests:
node --test tests/application/generated-letter-lists.test.js tests/application/generated-list-spacing.test.js tests/application/application-pack-export.test.js tests/application/export-firstname-token.test.js tests/application/export-linked-opening-parity.test.js

Hard-refresh development after restart. Use an existing literal-bullet proposal or current letter; no new paid generation. Check gaps around newly generated lists, native wrapping, save/reopen and Word export. Existing explicit blank paragraphs in saved native lists remain intentional/unreviewed data and are not silently removed.

No database, Word/PDF template, production environment, AI prompt or integration flag is changed. Full Windows/browser and DOCX/PDF acceptance remain local checks. Do not deploy until accepted.
