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
  },
  {
      "id": "slow-log-latest",
      "title": "Slow steps: latest lines",
      "category": "Performance",
      "command": "$f=Get-ChildItem 'D:\\NewModularProduct-Production\\shared\\logs\\production-*.log' | Sort-Object LastWriteTime -Descending | Select-Object -First 1; Select-String -Path $f.FullName -Pattern '\\[SLOW\\]' | Select-Object -Last 40 | ForEach-Object { $_.Line }",
      "purpose": "Shows the last 40 [SLOW] lines from the current production log: requests over 2 seconds, and moments when every tab waited over 200 ms.",
      "caution": "Read-only. Lines hold only method, path and milliseconds, so they are safe to paste into a support chat.",
      "effect": "Read-only",
      "directory": "D:\\monorepo\\NewModularProduct"
  },
  {
      "id": "slow-log-summary",
      "title": "Slow steps: summary by page or action (7 days)",
      "category": "Performance",
      "command": "$files=Get-ChildItem 'D:\\NewModularProduct-Production\\shared\\logs\\production-*.log' | Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-7) }; Select-String -Path $files.FullName -Pattern '\\[SLOW\\] (\\S+ \\S+) took (\\d+) ms' | ForEach-Object { [pscustomobject]@{Route=$_.Matches[0].Groups[1].Value; Ms=[int]$_.Matches[0].Groups[2].Value} } | Group-Object Route | ForEach-Object { $m=$_.Group | Measure-Object Ms -Average -Maximum; [pscustomobject]@{Route=$_.Name; Count=$_.Count; AverageMs=[int]$m.Average; MaxMs=[int]$m.Maximum} } | Sort-Object MaxMs -Descending | Format-Table -AutoSize",
      "purpose": "Groups the slow requests of the last 7 days by page or action, with count, average and worst time. The worst and most frequent rows are the ones to improve first.",
      "caution": "Read-only. send-commit at about 2 seconds is normal: each email starts the Gmail worker in the background and does not freeze other tabs.",
      "effect": "Read-only",
      "directory": "D:\\monorepo\\NewModularProduct"
  },
  {
      "id": "slow-log-freezes",
      "title": "Slow steps: worst whole-app freezes (7 days)",
      "category": "Performance",
      "command": "$files=Get-ChildItem 'D:\\NewModularProduct-Production\\shared\\logs\\production-*.log' | Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-7) }; Select-String -Path $files.FullName -Pattern 'Every tab waited about (\\d+) ms' | Sort-Object { [int]$_.Matches[0].Groups[1].Value } -Descending | Select-Object -First 15 | ForEach-Object { $_.Line }",
      "purpose": "Lists the 15 longest moments when every tab waited, with what was running. These are what make other tabs slow while sending.",
      "caution": "Read-only. 'In progress: none' means background work (for example the Insights rebuild), not a page.",
      "effect": "Read-only",
      "directory": "D:\\monorepo\\NewModularProduct"
  },
  {
      "id": "release-log-tail",
      "title": "Last release log (why a ship stopped)",
      "category": "Performance",
      "command": "$log=Get-ChildItem 'D:\\NewModularProduct-Production\\shared\\logs\\release-*.log' | Sort-Object LastWriteTime -Descending | Select-Object -First 1; $log.FullName; Get-Content $log.FullName -Tail 80",
      "purpose": "Shows the end of the latest release verification log, where the failing test or step is named when ship.cmd stops.",
      "caution": "Read-only. Check the output for personal details before pasting it into a chat.",
      "effect": "Read-only",
      "directory": "D:\\monorepo\\NewModularProduct"
  },
  {
      "id": "prod-running-commit",
      "title": "Production: running commit, supervisor mode and health",
      "category": "Production",
      "command": "$p='D:\\NewModularProduct-Production'; 'Commit: ' + (Get-Content \"$p\\active.json\" -Raw | ConvertFrom-Json).commit; 'Supervisor: ' + (Get-Content \"$p\\supervisor-status.json\" -Raw | ConvertFrom-Json).mode; try { Invoke-RestMethod 'http://127.0.0.1:3100/healthz' -TimeoutSec 5 | Out-Null; 'HEALTH OK' } catch { 'HEALTH FAILED' }",
      "purpose": "Shows which commit production runs, whether the supervisor is running or paused, and whether port 3100 answers. Use it after a ship to confirm the new commit is live.",
      "caution": "Read-only. 'paused' with HEALTH FAILED after a stopped ship: see 'Resume a paused production'.",
      "effect": "Read-only",
      "directory": "D:\\monorepo\\NewModularProduct"
  },
  {
      "id": "prod-resume-paused",
      "title": "Resume a paused production",
      "category": "Recovery",
      "command": "$p='D:\\NewModularProduct-Production'; $s=Get-Content \"$p\\supervisor-status.json\" -Raw | ConvertFrom-Json; if ($s.mode -ne 'paused') { 'Supervisor is ' + $s.mode + '; nothing to resume.' } else { $tmp=\"$p\\supervisor-control.json.$([guid]::NewGuid().ToString('N')).tmp\"; (@{session=$s.session; paused=$false} | ConvertTo-Json) | Set-Content $tmp -Encoding UTF8; Move-Item $tmp \"$p\\supervisor-control.json\" -Force; Start-Sleep 3; try { Invoke-RestMethod 'http://127.0.0.1:3100/healthz' -TimeoutSec 5 | Out-Null; 'HEALTH OK' } catch { 'HEALTH FAILED' } }",
      "purpose": "Tells a paused production supervisor to serve again, for example after a ship stopped part-way. Does nothing unless the supervisor reports paused.",
      "caution": "Use only when no ship is running. It changes no data or release; if health still fails, close the production window with Ctrl+C and start it again.",
      "effect": "Changes production",
      "directory": "D:\\monorepo\\NewModularProduct"
  }
]);
