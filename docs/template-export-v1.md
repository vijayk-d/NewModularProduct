# Template export v1 — development only

> **Superseded.** This describes the first, development-only increment and is kept for history. The letter PDF is now included in the ZIP, the template works in production, and setup uses `tools/maintenance/set-cover-letter-template.mjs`. See [cover-letter-template.md](cover-letter-template.md) for current behaviour.

Scope: actual application-pack DOCX integration and rich-editor list indentation. This is an incremental delivery, NOT a completed one-click PDF export.

- On port 3000 with the private template configured, Export pack builds cover-letter.docx from the saved sanitised HTML and supplied Word template.
- Original template letterhead/styles/page settings retained; HTML wording/order preserved; native Word lists use marker tabs and hanging alignment.
- Plain/HTML consistency, revision/CV checks, read limits and the final state recheck remain in force.
- ZIP also includes cover-letter-export.json and Convert-CoverLetterToPdf.ps1. PDF is NOT in the initial ZIP. Extract outside the checkout and run the converter explicitly on an attended Windows desktop.
- Word COM is NEVER started by the HTTP server. The converter uses the successful prepared-DOCX approach: no custom COM list creation, read-only input copy, explicit export, scoped cleanup/reporting.
- Production/verification return to existing legacy export behaviour. This package does not promote a release or change production configuration.
- Only future exports change. Existing packs untouched. No database writes, AI regeneration, paid calls or Gmail operation is added by exporting.
- List stylesheet uses native outside markers and a fixed inset; no literal tabs/spaces inserted into editor text. Local browser verification remains required.

## Local private assets
.private/cover-letter-export/template.docx and settings.json are created by the installer; a local .gitignore hides only this private directory. Do not stage the personal Word template. No .env file is changed.

## Tests after install
node --test tests/application/application-pack-export.test.js tests/application/export-firstname-token.test.js tests/application/export-linked-opening-parity.test.js tests/application/template-cover-letter-export.test.js
python -B tests/worker/test_cover_letter_template_export.py

## User acceptance
Use a saved test review on port 3000. Exercise bullets, numbering and a LONG numbered item that wraps, plus manual bold/italic/underline/highlight and a job hyperlink. Save before exporting. Confirm exact wording, selected CV bytes, header, no duplicated greeting/signoff, tab-style alignment and page breaks in the real exported Word document. Do not regenerate a paid letter to test formatting.

Extract the exported ZIP outside the repository. Review the included script and then:
powershell.exe -NoProfile -STA -File .\Convert-CoverLetterToPdf.ps1
powershell.exe -NoProfile -STA -File .\Convert-CoverLetterToPdf.ps1 -Run

If RemoteSigned blocks the script, review and unblock only that file; do not weaken machine policy. Word conversion requires the active desktop/user; it is not approved as an unattended production service. Compare the PDF to its Word source. Editing the DOCX invalidates the manifest hash; re-export rather than silently converting a different revision.

## Commit scope
Stage only the files listed in the delivery SCOPE.txt AFTER tests and browser checks. Never git add . . Rollback with the maintained installer --rollback before any unrelated changes to managed files. Later edits cause refusal. Do not deploy this experimental increment yet.
