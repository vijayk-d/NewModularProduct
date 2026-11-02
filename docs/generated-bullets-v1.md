# Generated bullet display v1

Follow-up to the working manual list styling/template export increment. Converts recognised leading literal `• ` lines into native `<ul><li>` lists in CURRENT and PROPOSED editor views. It does not ask the model for tabs/HTML, change provider prompts, add generation calls or touch PDF conversion.

Rules: group adjacent bullet items (allowing blank separator lines); retain wording/order, inline markup, links and highlight metadata; leave existing native lists alone; never infer bullets for unbulleted prose; do not interpret inline separators, years, hyphens or plain numbered prose. Ambiguous cross-line formatting and mixed pre-existing lists are conservatively retained for manual editing.

Supported input shapes: flat generated text rendered with `<br>`, or clean one-paragraph-per-item HTML. No automatic database migration. The shared plain-to-HTML renderer used by queue/backend callers remains unchanged. Only editor display hooks call the new normaliser. Saving or accepting uses the existing browser plain/HTML pair and version checks. Formatting markers disappear from visible plain text after native-list save; substantive wording must remain unchanged.

Testing locally:
node --test tests/application/generated-letter-lists.test.js tests/application/linked-role-opening.test.js tests/application/contextual-highlight-correction.test.js tests/application/outreach-rich-snapshot.test.js tests/application/application-save-resume.test.js tests/application/application-pack-export.test.js tests/application/export-firstname-token.test.js tests/application/export-linked-opening-parity.test.js

Restart development on port 3000, hard-refresh, and open an existing letter/proposal with literal experience bullets. Do not request paid polishing to test this. Check native markers, wrapping, emphasis and hyperlinks; save/accept, reopen and export. Remove a list using the toolbar, save and reopen: it must stay removed. Keep a copy of important unsaved text before restarting.

This patch does not change the existing DOCX/PDF export implementation. The initial ZIP's lack of an actual PDF remains an open requirement; the attended script is not a completed direct-PDF export feature.

Browser visual behaviour and Windows Node24/SQLite require local checks. The test fixture exercises real save/export functions and actual HTTP accept/stale-token routes without a provider call. No deployment is performed. Review changes and scope before committing; never stage whole folders/private data.
