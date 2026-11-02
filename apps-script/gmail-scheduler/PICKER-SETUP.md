# Scheduler Option A — explicit per-file authorisation

This add-on preserves drive.file. It adds no full-Drive, Drive-readonly or metadata-readonly scope, changes no worker privacy guard, and does not send mail or activate a trigger. Google Picker selection grants this Apps Script app access to the particular file selected. The API key identifies the Picker project; the OAuth access token supplies the user's authorisation. Never put keys, tokens or private configuration in source.

## Local installation
Extract this package into D:\monorepo\NewModularProduct and run:

    python tools/GmailSchedulerPicker/install.py --root . --apply --verify

The installer preserves Code.gs, appsscript.json, Scheduler.gs, InspectBinding.gs, Tampermonkey, .env and all runtime data. It adds SchedulerPicker.gs, SchedulerFilePicker.html, this guide and tests. It adds only script.container.ui to the existing proposed scheduler manifest. The delivery source filter is extended to preserve maintained .html files under apps-script. The original scheduling installer/payload/checksums are updated consistently so its normal verification remains usable. Existing affected files are backed up. No Google configuration, Cloud project, permissions, trigger, Sheet, database, commit, push or production operation is changed by the installer.

## Google prerequisites — same project throughout
Keep nmpSchedulerTick paused in both the old incorrect project and the corrected bound project. Use only the corrected project opened through the configured scheduler Sheet's Extensions > Apps Script.

1. Open Apps Script > Project Settings > Google Cloud Project. Picker requires a STANDARD Cloud project, not an Apps Script default project. Use an appropriate existing dedicated scheduler Cloud project, NOT the production Gmail project. Its project NUMBER (digits) is required, not its project ID/name.
2. If the Apps Script project is currently Default, switching it to a standard project cannot be reversed back to Default. Review and explicitly approve this change before using Change project > enter the scheduler project NUMBER > Set project. Switching can require reauthorisation and re-enabling APIs; Google also warns it can affect existing authorisations for apps associated with that project. Do not delete/recreate/revoke existing desktop OAuth credentials or regenerate the signing key as a shortcut. No new desktop OAuth client is required by this Picker integration.
3. In THAT SAME standard Cloud project, ensure Google Picker API, Google Drive API and Gmail API are enabled. Existing Sheets API access must remain enabled for the local scheduler. Preserve advanced Gmail v1 and Drive v3 services in Apps Script.
4. Create a restricted API key in that same Cloud project (or use an appropriately restricted existing Picker key). Restrict websites/HTTP referrers to Apps Script Google hosts: https://*.google.com/*, https://*.googleusercontent.com/* and https://docs.google.com/*. Restrict APIs to Google Picker API and Google Drive API. Do not use an unrestricted key or paste the key into chat/source. The key is necessarily supplied to the browser's Google Picker; its restrictions are essential.
5. In the corrected Apps Script project's Script Properties add:
   NMP_PICKER_PROJECT_NUMBER = the same Cloud project NUMBER
   NMP_PICKER_API_KEY = the restricted API key
   Preserve NMP_SCHEDULER_KEY exactly as it is.

## Install the Google-side source
6. Add a Script file named SchedulerPicker and paste the local SchedulerPicker.gs. Add an HTML file named SchedulerFilePicker and paste SchedulerFilePicker.html. Keep all existing scheduler/pilot source unchanged.
7. In the Google editor use the updated appsscript.scheduler.json as appsscript.json, after reviewing its one new scope: https://www.googleapis.com/auth/script.container.ui. Do not replace drive.file with a broader Drive scope. Save. Google may ask you to reauthorise the Apps Script project for the reviewed scopes.
8. From the editor run nmpShowSchedulerPicker. Return to the scheduler SPREADSHEET browser tab: the dialog opens in that document, not inside the script editor. Click Choose the existing scheduler Sheet.
9. In Google Picker select only the exact existing scheduler Sheet identified in the dialog. Do not create/upload a file. The view is owner-only spreadsheets and single selection by default. Selection of another file can already grant access to that file before the server rejects it; do not select other files. The helper does not silently revoke grants.
10. After the correct selection, the helper runs the existing nmpConfig_ privacy guard and nmpHeaders_ checks. Expected: Per-file Drive access and owner-only privacy checks passed for this bound Sheet. No trigger was started and no email was sent. If verification fails, do not bypass it or broaden permissions. A separate Verify selected Sheet access button repeats only the read-only validation.

Picker does not need a new public web app, local-server endpoint, broad Drive scope or separate manual OAuth token flow. The token comes from the authorised Apps Script context and is passed only to Google's Picker in the modal; it is not logged or saved. Do not share HAR/network traces or screenshots containing API keys/access tokens.

## After successful authorisation
Report only the safe success/failure message. Do NOT start the clock or create another email job yet. The existing uploaded test/cancellation remains in the Sheet and should be reconciled next. Source/test results do not establish live Google success; ten synthetic tests passed during preparation, while real standard-project/Picker/Drive authorisation still requires this acceptance.

## Rollback
The local installation receipt lists source files and backups. Restore only listed source/packaging files if needed; never restore or reset mail history or scheduling state. Adding this helper does not start any trigger. Switching from a default Cloud project to standard is not reversible back to Default; removing the helper does not undo Cloud project association, OAuth consent or per-file grants. Manage those separately in the Google account/Cloud console after assessing active jobs.
