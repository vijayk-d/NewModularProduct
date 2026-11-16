# JobApp (NewModularProduct) - instructions for Claude Code

Repository: vijayk-d/NewModularProduct (private, default branch master). Earlier work was done up to PR #20. Pick up from the current state of master. Do not redesign what already works.

## Before any change
- Read only the files needed. Start with README.md, then NewModularProduct-Architecture.md, docs/architecture-decisions.md and NewModularProduct-Overall-Plan-Status.md when architecture context is needed.
- Check recent merged PRs (#13 onwards) for current behaviour.
- Confirm understanding in 2-3 lines, list files to read or change, then deliver.

## Owner and working style
- Owner: Vijay, an Agile delivery / programme professional in the UK. JobApp is his personal job-application system.
- Keep cost minimal: short answers, task-scoped reading, no broad repo dumps.
- Prefer complete replacement files over many small edits.
- Give one safe PowerShell block at a time: $ErrorActionPreference='Stop', check $LASTEXITCODE after every native command, git only (no gh CLI). Avoid here-strings; use plain string arrays.
- Use British English in user-facing text and letters.

## Environments and release
- Development: D:\monorepo\NewModularProduct, port 3000. Production: D:\NewModularProduct-Production, port 3100. Never open or edit the production folder.
- Runtime: Node 24 (node:sqlite, ES modules), Python 3.13 workers.
- CI: GitHub Actions (.github/workflows/ci.yml), Windows runner, runs python tools/deploy/ci_verify.py (about 3-4 minutes). Rerun a flaky Playwright navigation timeout once before changing code.
- Flow: feature branch, PR to master, CI green, merge, then Vijay stops development and runs tools\deploy\ship.cmd.

## Non-negotiable rules
- Never send Gmail. Never add automatic retries of external operations.
- Never overwrite production databases or change existing production schemas. New data goes in new files or tables. Respect tools/deploy/storage-contract.json.
- Keep CSV, DB, .env, CV files and personal data local. Never commit them, read them or paste them into chats.
- Git: no "git add .", no reset --hard, no push --force. Stage explicit paths. Never rewrite history on master. Keep Vijay as author.
- The working tree contains many untracked local files (old installer kits, backups, zips, var/). Never stage or delete them unless asked.
- Letters must be evidence-led: never invent employers, metrics, sectors or public-sector claims that are not in the CV or scenario evidence.
- Scenario wording is owner data. Do not silently rewrite it.

## Architecture (hexagonal, functional core and imperative shell)
- src/domain: pure rules, imports nothing outside domain.
- src/application: use cases and orchestration, depends on domain and ports.
- src/infrastructure: adapters (sqlite stores, documents, Perplexity, templates).
- src/interfaces: cli and http, wires everything together.
- src/config: runtime config, feature toggles, deployment runtime.
- python-worker, apps-script, tampermonkey, tools/deploy as in the architecture document.
- Tests use fake adapters and make no network calls.
- Commands: npm start, npm test, npm run test:concise, npm run test:ui, npm run test:all. Playwright needs Node 24.

## Delivering a change
1. Make the smallest complete change on a branch (feat/... or fix/...).
2. Add or adjust node:test tests, and Playwright specs if the UI changed.
3. Compare per-test results with master. Every test that passed before must still pass.
4. Commit explicit paths and push the branch. Vijay opens and merges the PR in the GitHub web UI.
5. Final reply: what changed (bullets), any manual step, one line each on assumptions and risks (data, schema, cost), then "Reply merge when ready."
