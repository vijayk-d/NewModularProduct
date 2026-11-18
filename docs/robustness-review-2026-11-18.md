# Robustness review — 18 November 2026

Evidence boundary: source on master at `99d33e6`, read for this review. No code was changed. Each item names the file it was found in. Findings are ordered by risk to your data and your applications, then by effort.

## High: fix next

### R1. Paid AI calls have no time limit
- **Where:** `src/infrastructure/perplexity-client.js`, `src/infrastructure/research/perplexity-company-research-adapter.js`, `src/infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js`, `src/infrastructure/refinement/perplexity-cv-polishing-adapter.js`. None sets a timeout or abort signal.
- **Risk:** if Perplexity stops responding, the page waits for ever: research, letter polish and CV polish all hang. The automatic research on creating an application can delay the review page the same way.
- **Fix:** a per-call time limit (for example 90 s, configurable), using `AbortSignal.timeout`, with no retry. The message says the call timed out and that a charge may still have been made. The automatic research call gets a shorter limit, so the review page is never held up.

### R2. Email-domain lookups are saved inside the release folder
- **Where:** `src/application/email-domain-store.js` writes `data/email-domain-resolutions.json` relative to the source code, with a plain overwrite (not temp-and-rename).
- **Risk:** in production each release runs from a new `releases\<commit>` folder, so previously resolved domains are left behind on every ship. The file is also outside the backed-up `shared\data`, and a crash mid-write can leave it unreadable.
- **Fix:** a new file in the state folder, written atomically. Keep reading the old file once if present, so nothing is lost. No existing file is overwritten.

### R3. A crash leaves no reason behind
- **Where:** no `unhandledRejection` or `uncaughtException` handler anywhere in `src` or `tools`.
- **Risk:** an unexpected error in a background step (automatic research, Word PDF, a worker) can stop the server with nothing in the log saying why.
- **Fix:** log the error type and stack, without personal data, to the existing log, then exit non-zero so the production supervisor restarts the app. Add a startup line saying the previous run ended with an error.

## Medium: next few slices

### R4. SQLite locking under parallel requests
- **Where:** 8 stores open `DatabaseSync`; none sets `busy_timeout`.
- **Risk:** two writes at the same moment (autosave plus a background step) can fail at once with "database is locked".
- **Fix:** `PRAGMA busy_timeout=5000` on open. This doesn't change the file format or schema. Do not switch journal mode on production databases without a separate decision.

### R5. A "System check" page
- **What:** "Check all CVs" already exists. A read-only page should list everything the app depends on, each with a pass or fail and a fix-it hint:
  - every database opens and passes `quick_check`;
  - the CV library: PDFs, Word files, sections;
  - the letter template is set, and `APPLICATION_OUTPUT_FOLDER` is writable;
  - Word is available for PDF;
  - Perplexity and Gmail are switched on or off (flags only, never credentials);
  - disk free and Windows commit charge.
- **Why:** most recent faults (missing Word files, template not set, low memory) were configuration, found only when a button failed.

### R6. OneDrive "online-only" CV files
- **Where:** the CV folder is under OneDrive.
- **Risk:** a file that is only in the cloud may fail to read, or wait for a download, at the moment you draft or export.
- **Fix:** detect the offline/placeholder attribute in the document reader, and say "This CV is not downloaded on this PC; right-click it → Always keep on this device". The System check should flag it as well.

### R7. Release backups grow without limit
- **Where:** `tools/deploy/local_delivery.py` copies `shared\data` to `shared\backups\before-<commit>-<time>` on every ship. I found no clean-up.
- **Risk:** the disk slowly fills, and a full disk is itself a cause of failed ships and corrupt writes.
- **Fix:** report the backup count and size at ship time. Offer a separate, explicit command that keeps the newest N and lists what it would delete before doing it. Never delete automatically.

### R8. Local test results do not match CI
- **Where:** locally, Node `default template generates linked rich opening and valid plain fallback` fails, and 4 `application-preparation` UI specs need a dev server on port 3000.
- **Risk:** "the same failures as before" hides a new failure in the same file, and makes every change slower to verify.
- **Fix:** make the 4 specs start their own fixture server, as newer specs do. Fix or quarantine the one Node test with a recorded reason. The goal is zero known failures locally.

## Lower: maintainability and edge cases

### R9. Two very large files
- `src/interfaces/http/rendering.js` (2,140 lines) and `src/interfaces/http/create-local-server.js` (2,056 lines) hold many unrelated routes and views.
- Most regressions this month touched one of them.
- Continue the existing pattern: one `*-http.js` handler per feature, plus one rendering module per section. Move one area at a time, only when it is already being changed. No big-bang refactor.

### R10. Work lost on restart
- Email-domain resolution jobs (`email-domain-resolution-service.js`) and Gmail draft confirmation tickets (`confirmed-gmail-draft-service.js`) live in memory.
- After a restart the page polls a job that no longer exists. The page should say "This step was interrupted by a restart; start it again" rather than spin.

### R11. Word left running after a PDF timeout
- `src/infrastructure/documents/word-pdf-converter.js` has a 120 s time limit and kills PowerShell.
- A `WINWORD.EXE` it started can be left open, and that blocks the next PDF.
- The script should close the Word instance it opened, in a `finally`, and the timeout message should mention Task Manager.

### R12. CV structure detection is heuristic
- Tailored CV recognises headings, employer blocks and an untitled opening profile. A new CV layout can still be misread.
- Mitigations already in place: "Check all CVs", chosen headings saved per CV, and the build verifies the result before saving.
- Run the check whenever a CV is added. The System check (R5) should include it.

## Suggested order
1. R1, R2 and R3 together as one small "robustness pack", one branch.
2. R4 and R8.
3. R5, which absorbs R6 and R12's check.
4. R7, R10 and R11.
5. R9, alongside feature work.

Every item follows the project rules: no automatic retries of external operations, no change to existing production schemas (new data goes in new files or tables), and nothing deleted without an explicit, previewed step.
