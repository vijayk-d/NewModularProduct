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
    "caution": "Already-installed package: do not use --apply again.",
    "effect": "Runs tests",
    "directory": "D:\\monorepo\\NewModularProduct"
  },
  {
    "id": "evidence-browser",
    "title": "Evidence library browser test",
    "category": "Testing",
    "command": "python tools/AssignmentEvidenceLibrary/install.py --root . --browser",
    "purpose": "Runs the isolated in-memory evidence-library browser test.",
    "caution": "Requires installed package and existing Playwright/Chromium. No live provider services.",
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
    "command": "git push origin feat/review-provider-output",
    "purpose": "Publishes committed work on the current project branch.",
    "caution": "Only after reviewing branch/remote/commits for private data. Does not include uncommitted files or deploy production. Resolve remote changes normally; never force-push as a routine fix.",
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
    "command": "& \"D:\\NewModularProduct-Production\\start-production.bat\"",
    "purpose": "Starts the production-owned supervisor on port 3100.",
    "caution": "Only if not already running; keep its console open. The development launcher is not a production launcher.",
    "effect": "Starts production process",
    "directory": "D:\\monorepo\\NewModularProduct"
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
    "caution": "Review for hard-coded private information before sharing. No .env, CV or database uploads. The current collector omits fixtures and some maintenance utilities, so a capture is not a complete runnable checkout.",
    "effect": "Writes source report",
    "directory": "D:\\monorepo\\NewModularProduct"
  }
].map(Object.freeze));
