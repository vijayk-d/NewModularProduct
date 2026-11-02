Root-folder workflow launchers
=============================
Extract this package into D:\monorepo\NewModularProduct.

The two entry points are commit-changes.bat and deploy-production.bat.
Their shared implementation is tools/maintenance/root_workflow.py.
No PowerShell .ps1 execution is needed.

1. Test your changes in development.
2. Run commit-changes.bat. Review the exact scope, enter a commit message,
   then type COMMIT. Existing staging is committed as-is, after scope/secret
   checks; it is not overwritten with unstaged content.
3. Stop development on port 3000. Leave a running production supervisor open.
4. Run deploy-production.bat. Review the commit and type DEPLOY.
5. Keep the production supervisor window open and check the final health result.

Commit scope uses the existing delivery source allowlist plus these two root
launchers. Local .env files, databases, CV/PDF files, archives, ignored files,
unsupported local artifacts, and a redundant non-dual userscript when its
matching dual-port version exists are not automatically added. A secret scan
is an aid, NOT a privacy guarantee: inspect source contents before approving.

Neither entry point pushes, reseeds production data, edits environment files,
or enables Gmail/Perplexity. The commit command does not run or certify tests.
The deploy command uses the EXISTING full delivery verification pipeline; it
is not a cached-build/fast-deploy implementation. Root .bat entry points are
local source-workflow files; the existing delivery allowlist need not copy
these two entry points into production release directories.

If the current commit is already active, the controller skips rebuilding it.
If a failed release directory already exists, investigate its reported log;
these launchers will not delete failed releases, locks, or user changes.
The older checkpoint staged-text comparison bug is not used by this workflow.
