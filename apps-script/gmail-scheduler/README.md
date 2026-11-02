# Gmail scheduler — development candidate 0.1

Status: code candidate, not live-accepted or production-enabled.

## Preserved source
Code.gs and appsscript.json are the user's existing self-test pilot and manifest. The installer does not overwrite either file. Scheduler.gs is the new application worker. appsscript.scheduler.json is a proposed extended manifest, NOT an automatically activated manifest. Tampermonkey files and their @version headers are not modified.

## Workflow and limits
The application review freezes the prepared MIME, including signature and one CV attachment. Recipient, body, subject, attachment names/hashes and send instant require fresh explicit approval. The existing send ledger reserves the application/recipient so this app cannot separately send it while reserved. Gmail drafts are scheduled as frozen copies: the original draft is retained and later draft edits do not change the scheduled copy. Do not send that draft manually.

Messages and CV bytes are uploaded as base64 MIME into the existing private scheduler Sheet. Base64 is not encryption. The confirmation explicitly discloses the upload. No credentials or signing key are put in the Sheet. Signed commands and signed status receipts bind the account, exact Sheet ID and namespace. The worker requires owner-only Sheet permissions on every tick and again before dispatch. It never reads the inbox.

Requested time is converted from the displayed browser timezone; review browser time, Europe/London and UTC before confirmation, including DST. Minimum two minutes; maximum 30 days. Google trigger timing is best-effort. One message per tick; maximum 15-minute late window, then MISSED. Encoded MIME limit 4 MiB (smaller than immediate-send limits); oversize mail is rejected, never truncated. Maximum 200 local scheduling records and 10,000 request rows for this candidate. Do not delete cloud job markers, rows or local ledgers to bypass limits; archival/reconciliation needs review.

SENDING is durably recorded before Gmail is called. An interrupted attempt becomes UNKNOWN, with no automatic retry. Gmail API acceptance records its real message ID; this is not delivery or ATS confirmation. Cancellation is only a request until the cloud confirms CANCELLED, and cannot recall an in-flight send. A cancel arriving before an uncertain schedule upload leaves a tombstone that blocks delayed publication.

Local status is under the development state directory in gmail-scheduler-v1/jobs.json. Existing outreach.db uses its existing send ledger; there is no SQL schema change. Do not reset/reseed/restore either state to clear uncertain outcomes. Refreshing cloud status reconciles authenticated terminal outcomes to the existing ledger. If reconciliation fails, preserve the job and Gmail IDs and do not resend. Only one local app instance should control this namespace.

## Installation and offline validation
Extract the delivery ZIP into the repository, stop development on port 3000, leave production on 3100 alone.

    python tools/GmailScheduling/install.py --root . --check
    python tools/GmailScheduling/install.py --root . --apply --verify

The first command validates an isolated candidate checkout using synthetic fixtures, no .env and no network. The installer backs up exactly the five modified baseline files and refuses changed HEAD/source, staging, payload conflicts, symlink paths or a changed pilot manifest. It preserves existing Code.gs/appsscript.json, all Tampermonkey files and all runtime databases. It makes no Git writes or Google calls.

After application source installation, restart development normally and visit /outreach-scheduling. Scheduling remains disabled until explicitly configured. The ordinary outreach queue also has a scheduling link.

    python tools/GmailScheduling/install.py --root . --verify
    python tools/GmailScheduling/install.py --root . --browser

--browser runs the packaged synthetic Playwright UI fixture; it does not use a real mailbox or CV. Full-project release verification and actual cloud acceptance are separate.

## Later activation — separate user-approved steps, not part of install
1. Review the candidate manifest additions: Gmail send-only and Drive per-file access, plus advanced Gmail v1 and Drive v3 services. Preserve the existing scopes required by the pilot. No inbox/read/modify Gmail scope is requested. Drive per-file authorisation to this bound Sheet must actually work; failure blocks sending. Do not broaden scopes to bypass a failure.
2. In the SAME existing bound Apps Script project, add Scheduler.gs, leaving Code.gs unchanged. After approving the scope changes, use appsscript.scheduler.json as the project manifest in the Google editor. Ensure the advanced services/APIs are enabled for that Apps Script project. Do not recreate the dedicated OAuth setup or Sheet. No public web app or external endpoint is used.
3. Generate one 32-byte random key locally (64 lowercase hex characters). Store the same value only in local development .env as CLOUD_SCHEDULER_SIGNING_KEY and in Script Properties as NMP_SCHEDULER_KEY. Do not send it in chat or save it in source. Reuse the existing CLOUD_SCHEDULER_OAUTH_* credentials, CLOUD_SCHEDULER_SPREADSHEET_ID, CLOUD_SCHEDULER_NAMESPACE and expected GMAIL_FROM_ADDRESS. Do not change production configuration.
4. Only after reviewing/approving cloud activation, manually run nmpSchedulerInstall and accept its explicit dialog. It initialises only empty Requests/Jobs tables and creates only nmpSchedulerTick. Existing nonempty table layouts are not overwritten. This function sends no email, but enables future already-approved requests to be processed. Do not run optionBPilotTick or create duplicate pilot jobs for this activation.
5. Separately set NMP_ENV=development and enable development flags ENABLE_CLOUD_SCHEDULING=true and NMP_ALLOW_DEVELOPMENT_INTEGRATIONS=true. Existing Gmail flags/configuration needed for the normal send-preview path must also be enabled deliberately; the installer changes no flags. Restart development.
6. Review and approve exactly one self-addressed application-like test with a synthetic attachment. Check scheduled acknowledgment, cancel-before-dispatch, then one approved timed send and real Gmail message ID reconciliation. PC-off execution, signature/attachment fidelity, cancellation race, sharing/permission failure and interrupted dispatch require real acceptance before normal application use. Do not test on recruiters.

The package is not fully accepted Gmail scheduling until the Windows composed app/browser checks and these Google-side checks pass. No automatic setup, authorisation, trigger activation or live send is performed by any installer/test command.

## Rollback
Before any cloud jobs are published, restore only source files from the install backup and remove only the new files recorded in installation.json. Never restore databases or mail-history state. After activation/publication, request cancellations and obtain terminal cloud acknowledgment, then pause the worker using nmpSchedulerPause; an in-flight send cannot be recalled. Preserve local and cloud state/tombstones and reconcile outcomes before rolling back source. Do not delete an operation lock without checking whether its process is still running.

## Local flags, queue deletion and cloud execution
Turning local flags off, closing the laptop, stopping port 3000, deleting a queue row or rolling back application source does NOT cancel an accepted cloud schedule. Use explicit cancellation and wait for signed cloud acknowledgment. If local API access is disabled, nmpSchedulerPause can stop future trigger runs after explicit confirmation, but it does not cancel jobs or recall an in-flight message. Never assume a pause/disable is a cancellation.

Use only the existing bound Apps Script project for this Sheet/namespace. Do not create another worker project or clone scheduling state to bypass reservations. Do not rotate the signing key while pending/uncertain jobs exist.
