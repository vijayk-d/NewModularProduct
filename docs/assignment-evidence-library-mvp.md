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
