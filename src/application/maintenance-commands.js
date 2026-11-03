// Read-only command reference for /maintenance. Nothing here is executed by the server.
export const MAINTENANCE_COMMANDS = Object.freeze([
  {
    "id": "start-dev",
    "title": "Start development",
    "category": "Daily use",
    "command": ".\\start-local-server.bat",
    "purpose": "Starts development on port 3000.",
    "caution": "Use the development checkout, not the production folder.",
    "effect": "Starts process",
    "directory": "D:\\monorepo\\NewModularProduct"
  },
  {
    "directory": "D:\\monorepo\\NewModularProduct",
    "id": "ship",
    "title": "Ship to production (one command)",
    "category": "Daily use",
    "command": "tools\\deploy\\ship.cmd",
    "purpose": "Runs every test, commits, pushes master, delivers to production and waits for health.",
    "caution": "Stop development (3000) first. Must be on master and not behind GitHub. Stops at the first failure.",
    "effect": "Changes production"
  },
  {
    "directory": "D:\\monorepo\\NewModularProduct",
    "id": "ship-test",
    "title": "Run every test (same as CI)",
    "category": "Testing",
    "command": "tools\\deploy\\ship.cmd -TestOnly",
    "purpose": "Runs the full Node, Python and Playwright suite without committing or delivering.",
    "caution": "Stop development (3000) first.",
    "effect": "Runs tests"
  },
  {
    "directory": "D:\\monorepo\\NewModularProduct",
    "id": "bootstrap-dev",
    "title": "Bootstrap development environment",
    "category": "Setup",
    "command": "powershell -ExecutionPolicy Bypass -File tools\\maintenance\\bootstrap-dev.ps1",
    "purpose": "npm ci, Python .venv, .env from template, template and inventory, Playwright, smoke tests.",
    "caution": "Safe to re-run; never overwrites .env or private data. Needs Git, Node 24+, Python 3.11+.",
    "effect": "Local setup"
  },
  {
    "directory": "D:\\monorepo\\NewModularProduct",
    "id": "repo-audit",
    "title": "Repository completeness audit",
    "category": "Setup",
    "command": "powershell -ExecutionPolicy Bypass -File tools\\maintenance\\audit-repo-completeness.ps1",
    "purpose": "Lists code and docs that exist only on this PC, and references to files not in GitHub.",
    "caution": "Read-only. Commit what it finds by name (git add <path>), never git add with a dot.",
    "effect": "Read-only"
  },
  {
    "id": "git-status",
    "title": "Inspect Git status",
    "category": "Git and checkpoint",
    "command": "git status --short --branch",
    "purpose": "Shows branch and staged, modified and untracked paths.",
    "caution": "Does not prove the remote tracking information is fresh.",
    "effect": "Read-only",
    "directory": "D:\\monorepo\\NewModularProduct"
  },
  {
    "id": "git-diff",
    "title": "Review changed-file summary",
    "category": "Git and checkpoint",
    "command": "git diff --stat\ngit diff --cached --stat",
    "purpose": "Review unstaged and staged file summaries.",
    "caution": "Inspect full diffs locally before committing. Never share secrets.",
    "effect": "Read-only",
    "directory": "D:\\monorepo\\NewModularProduct"
  },
  {
    "id": "regression",
    "title": "Application regression tests",
    "category": "Testing",
    "command": "npm test",
    "purpose": "Runs the Node test script declared in package.json.",
    "caution": "Not a complete release gate: the captured npm script targets *.test.js, not the added *.test.mjs tests. Stop development if tests use port 3000.",
    "effect": "Runs tests",
    "directory": "D:\\monorepo\\NewModularProduct"
  },
  {
    "id": "instructions-test",
    "title": "Personal instructions regression",
    "category": "Testing",
    "command": "node --test tests/application/personal-polishing-instructions.test.mjs",
    "purpose": "Explicitly runs the personal-instructions tests omitted by the captured npm test glob.",
    "caution": "Requires the installed personal-instructions feature.",
    "effect": "Runs tests",
    "directory": "D:\\monorepo\\NewModularProduct"
  },
  {
    "id": "evidence-verify",
    "title": "Verify installed evidence library",
    "category": "Testing",
    "command": "python tools/AssignmentEvidenceLibrary/install.py --root . --verify",
    "purpose": "Checks installed files, syntax and focused regressions.",
    "caution": "Already-installed package: do not use --apply again. Note: tools/AssignmentEvidenceLibrary is not in GitHub (local only) — run the completeness audit.",
    "effect": "Runs tests",
    "directory": "D:\\monorepo\\NewModularProduct"
  },
  {
    "id": "evidence-browser",
    "title": "Evidence library browser test",
    "category": "Testing",
    "command": "python tools/AssignmentEvidenceLibrary/install.py --root . --browser",
    "purpose": "Runs the isolated in-memory evidence-library browser test.",
    "caution": "Requires installed package and existing Playwright/Chromium. No live provider services. Note: tools/AssignmentEvidenceLibrary is not in GitHub (local only) — run the completeness audit.",
    "effect": "Isolated browser test",
    "directory": "D:\\monorepo\\NewModularProduct"
  },
  {
    "id": "tidy-browser",
    "title": "Presentation/focus browser test",
    "category": "Testing",
    "command": "npx --no-install playwright test --config tools/WorkflowPresentationTidy/playwright.config.mjs",
    "purpose": "Replays the isolated fake-provider section-focus tests.",
    "caution": "Requires that package. No automatic dependency installation.",
    "effect": "Isolated browser test",
    "directory": "D:\\monorepo\\NewModularProduct"
  },
  {
    "id": "general-browser",
    "title": "General application browser suite",
    "category": "Testing",
    "command": "npm run test:ui",
    "purpose": "Runs the existing default Playwright configuration.",
    "caution": "CAUTION: the captured default config can reuse the normal server on port 3000. Use isolated synthetic state and disabled integrations; do not run against a live working session. Prefer feature-specific isolated tests for routine checks.",
    "effect": "Requires isolation",
    "directory": "D:\\monorepo\\NewModularProduct"
  },
  {
    "id": "plan",
    "title": "Prepare reviewed checkpoint plan",
    "category": "Git and checkpoint",
    "command": "python tools/deploy/local_delivery.py plan",
    "purpose": "Creates the existing deployment/checkpoint review plan.",
    "caution": "May write plan/template/dependency-lock artifacts. Review the printed plan and diffs. Not a commit or deployment.",
    "effect": "Writes planning artifacts",
    "directory": "D:\\monorepo\\NewModularProduct"
  },
  {
    "id": "checkpoint",
    "title": "Test and commit a reviewed plan",
    "category": "Git and checkpoint",
    "command": "python tools/deploy/local_delivery.py checkpoint --plan \"REPLACE_WITH_REVIEWED_PLAN_JSON\"",
    "purpose": "Runs the existing checkpoint gates and stages/commits the reviewed scope on success.",
    "caution": "Replace the placeholder. Review exact paths first; never git add . . Tests may install locked dependencies. Do not continue after failure. This does not push to GitHub.",
    "effect": "Commits repository",
    "directory": "D:\\monorepo\\NewModularProduct"
  },
  {
    "id": "push",
    "title": "Push reviewed branch to GitHub",
    "category": "Git and checkpoint",
    "command": "git push origin master",
    "purpose": "Pushes master to GitHub; GitHub Actions then runs the full test suite on Windows.",
    "caution": "ship.cmd already pushes. Use this only after ship -NoPush. Never force-push.",
    "effect": "Remote write",
    "directory": "D:\\monorepo\\NewModularProduct"
  },
  {
    "id": "deliver",
    "title": "Deploy the reviewed commit",
    "category": "Production",
    "command": "python tools/deploy/local_delivery.py deliver --ref HEAD",
    "purpose": "Uses the existing tested-commit deployment process.",
    "caution": "HEAD must be the reviewed release commit. Dirty files are not included. Requires full release gates and compatible storage contracts. May briefly pause production. No automatic reseed.",
    "effect": "Changes production",
    "directory": "D:\\monorepo\\NewModularProduct"
  },
  {
    "id": "health",
    "title": "Check production health",
    "category": "Production",
    "command": "python tools/deploy/local_delivery.py health",
    "purpose": "Checks production health with the existing controller.",
    "caution": "Check the output; a copied command card is not live health evidence.",
    "effect": "Health check",
    "directory": "D:\\monorepo\\NewModularProduct"
  },
  {
    "id": "status",
    "title": "Inspect production controller status",
    "category": "Production",
    "command": "python tools/deploy/local_delivery.py status",
    "purpose": "Shows production controller/release status.",
    "caution": "Do not blindly delete stale locks; inspect processes, port and heartbeat first.",
    "effect": "Status check",
    "directory": "D:\\monorepo\\NewModularProduct"
  },
  {
    "id": "start-prod",
    "title": "Start production supervisor",
    "category": "Production",
    "command": "powershell -ExecutionPolicy Bypass -File tools\\deploy\\Start-Production.ps1",
    "purpose": "Starts production on port 3100 and clears a stale \"Supervisor lock exists\" safely.",
    "caution": "Stops nothing unless you add -StopOrphan. Close production with Ctrl+C, not the window X.",
    "effect": "Starts production process",
    "directory": "D:\\monorepo\\NewModularProduct"
  },
  {
    "directory": "D:\\monorepo\\NewModularProduct",
    "id": "prod-status-only",
    "title": "Production status (change nothing)",
    "category": "Production",
    "command": "powershell -ExecutionPolicy Bypass -File tools\\deploy\\Start-Production.ps1 -StatusOnly",
    "purpose": "Reports lock, port 3100 and health without starting or stopping anything.",
    "caution": "None; read-only.",
    "effect": "Read-only"
  },
  {
    "directory": "D:\\monorepo\\NewModularProduct",
    "id": "stop-orphan",
    "title": "Stop orphaned production server, then start",
    "category": "Recovery",
    "command": "powershell -ExecutionPolicy Bypass -File tools\\deploy\\Start-Production.ps1 -StopOrphan",
    "purpose": "Stops a NewModularProduct node process left holding port 3100, then starts production.",
    "caution": "Use only when -StatusOnly reports an orphan. Never deletes data.",
    "effect": "Changes production"
  },
  {
    "directory": "D:\\monorepo\\NewModularProduct",
    "id": "feature-toggles",
    "title": "Feature toggles",
    "category": "Production",
    "command": "start http://127.0.0.1:3100/settings/features",
    "purpose": "Switch production features on or off; restart production to apply.",
    "caution": "Gmail sending needs Gmail and mailbox check first. Each email still needs explicit confirmation.",
    "effect": "Changes production settings"
  },
  {
    "id": "rollback",
    "title": "Roll back production code",
    "category": "Recovery",
    "command": "python tools/deploy/local_delivery.py rollback",
    "purpose": "Requests the existing guarded previous-release code rollback.",
    "caution": "Not a database or Gmail rollback. Never rewind mail ledgers or blindly retry uncertain sends. Inspect failure details rather than bypass contracts.",
    "effect": "Changes production",
    "directory": "D:\\monorepo\\NewModularProduct"
  },
  {
    "id": "capture",
    "title": "Capture current development source",
    "category": "Diagnostics",
    "command": "python tools/WorkflowStabilisation/capture.py --root .",
    "purpose": "Creates the source report for development support.",
    "caution": "Review for hard-coded private information before sharing. No .env, CV or database uploads. The current collector omits fixtures and some maintenance utilities, so a capture is not a complete runnable checkout. Note: tools/WorkflowStabilisation is not in GitHub (local only).",
    "effect": "Writes source report",
    "directory": "D:\\monorepo\\NewModularProduct"
  }
]);
