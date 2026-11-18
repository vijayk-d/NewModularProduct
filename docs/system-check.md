# System check

**Where:** System → **System check** (`/system-check`; JSON at `/api/system-check`).

**What it is:** a read-only page that checks everything the app depends on, each time you open it (a few seconds). Nothing is changed, sent or charged, and credentials are never shown, only whether a feature is on and a key is present.

| Group | Check | A problem looks like |
|---|---|---|
| Local data | Every database in the state folder opens and passes `PRAGMA quick_check`; core databases exist | "Integrity problem: …" (fix: keep a copy; restore from `shared\backups`; never delete) |
| Local data | The email-domain lookups file is readable | Unreadable file (fix: move it aside) |
| Local data | No unexpected stop in the last 7 days (from `last-crash*.json`) | Time, error type and code location of the last crash |
| CV library | Every library CV has a Word file with recognised sections (same as **Check all CVs**) | CVs that are not ready, and why |
| CV library | Every library PDF and Word file exists and is stored on this PC | Missing files, or OneDrive online-only files (fix: Always keep on this device) |
| Documents | The cover-letter Word template is set | Export pack falls back to plain Word |
| Documents | `APPLICATION_OUTPUT_FOLDER` is set and valid | Not set, missing or overlapping the app folders |
| Documents | Microsoft Word is installed (for PDFs) | Word not found |
| Services | Organisation research, letter and CV polish (Perplexity) | On but no API key |
| Services | Gmail: which parts are on | On but OAuth client not configured |
| This PC | Free disk space on the data drive | Below 5 GB (warning), below 1 GB (problem) |
| This PC | Free Windows commit charge for shipping | Below `NMP_MIN_FREE_MEMORY_GB` (default 3 GB) |
| This PC | Release backups (production only): count and size | More than 30 backups or 20 GB |

**OneDrive files:** the CV file check reads Windows file attributes only. It never opens a CV, so an online-only file is reported without starting a download.

**When to open it:**
- after adding or renaming a CV;
- after changing `.env`;
- before running `ship.cmd`;
- whenever a button fails with a configuration-type message.
