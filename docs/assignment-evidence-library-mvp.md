# Assignment Evidence Library MVP — development candidate, 23 October 2026

Manual local assignment and scenario editor at `/evidence-library`. Create an assignment first, then multiple scenarios. Fill only what you know: missing facts stay blank. Separate employer, contracting entity and client. Capture diagnosis, options, personal actions, team contribution, tactical response, documented strategic connection, outcomes and learning.

## Evidence and approval
Default is needs-clarification, not approved. Source-supported requires a reference/version plus passage; user-confirmed requires explicit confirmation and basis. These labels are user assertions, not automated verification. Restricted/unsupported/needs-clarification scenarios cannot be approved externally. A separate approved-wording field is required. Editing scenario fields clears approval in the browser. Changing assignment context makes previous approvals stale; re-open, review and explicitly reapprove. Conflicting edits from another tab are rejected, not overwritten. Immutable saved-version snapshots are retained and viewable.

## Outputs
Private TXT dossier includes assignment fields, scenario notes, evidence passages, missing-field markers and an interview-question outline. It requires a private-export confirmation. Approved-extract TXT includes only current supported/confirmed approved wording, not private assignment/scenario titles or source notes. Nothing is automatically sent into cover-letter polishing, CV files, Gmail, or an ATS.

## Storage and scope
Startup creates `assignment-evidence-library-v1.db` under the existing development state directory (normally output), only for NMP_ENV=development. It is a new independent SQLite store; existing application/contact/queue/history databases are not migrated. Data is private local text, NOT encrypted by this MVP. Protect the machine and state directory; do not commit or share the database, exported dossier, or real evidence. Foreign/unsupported schemas are refused rather than reset. Startup errors disable the library with an explicit unavailable message, not an empty-success claim. Production does not initialise the store; the navigation link may show an unavailable response there. Verification fixtures inject isolated stores.

## Deliberately deferred
No AI ingestion/extraction, paid calls, automatic company/metric inference, CV rewriting, polishing integration, interview-answer generation, retention/deletion UI, or production enablement. Interview output contains prompts and your saved notes, not generated answers. JSON/text import and search/ranking are future slices. This MVP is the assignment pilot/manual evidence foundation, not the full library roadmap.

## Acceptance
Create an assignment and scenario, save/reload, approve supported wording, download private and approved outputs, inspect history, then change assignment context and confirm approved output excludes stale wording. Reopen after a server restart to verify local persistence. No existing application letter or queue should change.

## Shared library and production (3 Nov 2026)

This section supersedes the original MVP's development-only storage and deferred integration notes. With the existing absolute `NMP_CV_LIBRARY_DIRECTORY` configured identically in development and production, both use `<NMP_CV_LIBRARY_DIRECTORY>\evidence\assignment-evidence-library-v1.db` and edit the same private library, not separate copies. The evidence folder is created automatically. Keep this shared directory outside both application checkouts/releases, protect its permissions and back it up; SQLite data is not encrypted.

The **Evidence library** toggle defaults on in development and off in production. Existing production feature files with no entry leave it off. Enable it in production at `http://127.0.0.1:3100/settings/features` after shipping, then restart production normally for the setting to take effect. Without a shared directory production remains unavailable; development without one retains its existing state-directory database. Verification continues to use isolated injected fixtures. Navigation hides the link when the toggle is off; unavailable direct page/API requests retain their existing 503 response.

### One-off copy from development

Save browser edits and stop both development (3000) and the production supervisor/server (3100) normally before copying. From the updated development checkout run Windows PowerShell 5.1:

```powershell
Set-Location D:\monorepo\NewModularProduct
powershell -ExecutionPolicy Bypass -File tools\maintenance\move-evidence-to-shared.ps1
# If development .env does not specify the existing shared CV directory:
# powershell -ExecutionPolicy Bypass -File tools\maintenance\move-evidence-to-shared.ps1 -SharedDir 'D:\YourExistingSharedCvLibrary'
```

The script reads development `.env` only, checks `NMP_STATE_DIRECTORY` plus the normal `output` location, and refuses missing/ambiguous sources, running servers, or an existing shared database/sidecars. It copies, never moves, the database and any `-wal`/`-shm` files, with timestamped backups next to the original. For safety it refuses a configured development state outside `DevRoot`; review such a nonstandard layout manually rather than pointing it at production. No production data folder is read, migrated or overwritten. If interrupted after copying starts, preserve all files and inspect the partial destination manually; do not overwrite it or rerun blindly.

Restart development (`npm start`) and check `/evidence-library`, then stop development again before `tools\deploy\ship.cmd`. After the release, enable **Evidence library** in production Settings and restart production. Ensure production has the same absolute shared CV directory setting; do not replace the shared database with an older development copy once shared editing begins.

### Calls and polishing

The evidence library and scenario search/ranking make no paid calls and do not access or send email. Selecting ranked evidence can be handed off to saved applications; polishing with selected evidence uses one normal cover-letter polish call when cover-letter polishing is enabled. This works with **Cover-letter quality V2** off; the evidence library has no dependency on that toggle.

## Quick capture (27 Nov 2026)

The page now shows only what is needed to make usable evidence; the saved data and exports are unchanged.

- **Assignment:** name, employer, role and dates. The other eight fields are under **More detail (optional)**, which opens by itself when any of them already has text.
- **Scenario:** five plain questions: a short name, the situation, what you did, the result (figures only if you have them), and the wording to use in letters. The other eleven fields are under **More detail (optional)**; evidence state and the approval tick are under **Evidence and approval (advanced)**.
- **Fill wording from my answers** joins your three answers into the wording box as a starting point. It never rewrites or adds anything.
- **Save and use in letters** saves the scenario as confirmed by you and approved for letters in one step. It fills the confirmation basis ("Confirmed by me from my own experience on <date>") only when it is blank, and keeps a source-supported state if you set one. **Save scenario** still saves a draft without approval.
- The library shows progress ("N assignment(s) · N scenario(s) · N ready for letters"), and each assignment in the list shows how many of its scenarios are ready. A scenario whose approval went stale after the assignment changed is not counted as ready.

## Draft with AI (27 Nov 2026)

**Draft with AI (estimate first)** above the scenario form fills the five answers (short name, situation, what you did, result, wording for letters) from a CV you choose and the saved assignment, for you to review and amend.

- It uses the same AI setting as letter polishing (`ENABLE_COVER_LETTER_REFINEMENT=true` and `PERPLEXITY_API_KEY`). The estimate is free; the draft is one paid request after you confirm, with no web search and no retry.
- Sent: the chosen CV's text (up to 24,000 characters), the assignment's own fields and anything you already wrote in the five boxes, which the draft builds on.
- Wording is lively; facts are not invented. The instructions forbid adding employers, clients, sectors, public-sector bodies, tools, team sizes, dates or figures that are not in the sources. Any figure in the draft that is not in your CV or notes is listed for you to check or remove, and the draft's own notes say what to add (for example a measure).
- Nothing is saved or approved by drafting. Amend the boxes, then click **Save and use in letters** (or **Save scenario** for a draft).

