# Maintenance utilities

Extract this ZIP into the project root; all entries are under tools/maintenance.
From D:\monorepo\NewModularProduct run:

    python .\tools\maintenance\organize_legacy_utilities.py

This is a dry run. Review its list, then apply:

    python .\tools\maintenance\organize_legacy_utilities.py --apply --update-ignore

It archives explicitly named, untracked legacy root files in
var/maintenance/archive/<timestamp>. No wildcard deletion is used. Unknown files,
symlinks, Git-tracked files and application code/data/startup files are untouched.
If Git is unavailable, legacy files are skipped. The optional .gitignore edit only
appends /var/maintenance/ if absent; existing content is preserved.
RESTORE_MANIFEST.json records original and archived paths. Restore only to a free
original path. Archived utilities may rely on their old root location; do not run
them in the archive directory.

To collect the current source baseline:

    python .\tools\maintenance\collect_outreach_source.py

Output: var/maintenance/bundles/outreach-current-source.zip
Review the ZIP for hard-coded secrets/private fixtures before upload.
The collector reads package.json and supported source files under src,
python-worker, test and tests. It excludes .env files, databases, CVs, logs and
normal dependency/build directories. Source code may still contain secrets.
Both tools default to the current working directory, not their script location;
use --root with an explicit project directory if needed.
Do not stop the server; avoid simultaneous source edits during collection.
This package organizes utilities and collects source. It is not the UI/Gmail fix.
