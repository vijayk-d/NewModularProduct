# Commands

Run from `D:\monorepo\NewModularProduct` in PowerShell. Development uses port 3000, production uses port 3100.

## Daily flow

| Task | Command |
|---|---|
| Start development (3000) | `.\start-local-server.bat` |
| Run every test, same as CI (dev must be stopped) | `tools\deploy\ship.cmd -TestOnly` |
| Ship to production: test, commit, push, deliver | `tools\deploy\ship.cmd` |
| Ship without pushing to GitHub | `tools\deploy\ship.cmd -NoPush` |

`ship` stops at the first problem, so nothing is ever half-delivered. It refuses to run when:
- you aren't on `master`;
- development is still running on port 3000;
- `master` is behind GitHub.

It runs the full test suite before it commits anything. If production already runs the commit, it skips the delivery step.

## Production

| Task | Command |
|---|---|
| Start production safely (fixes "Supervisor lock exists") | `powershell -ExecutionPolicy Bypass -File tools\deploy\Start-Production.ps1` |
| Check only, change nothing | `powershell -ExecutionPolicy Bypass -File tools\deploy\Start-Production.ps1 -StatusOnly` |
| Stop an orphaned production server holding port 3100, then start | `powershell -ExecutionPolicy Bypass -File tools\deploy\Start-Production.ps1 -StopOrphan` |
| Stop production cleanly | Ctrl+C in the production window (don't close it with X) |
| Health | `py tools\deploy\local_delivery.py health` |
| Status (active and previous release) | `py tools\deploy\local_delivery.py status` |
| Roll back to the previous release | `py tools\deploy\local_delivery.py rollback` |

## Feature toggles

- Page: <http://127.0.0.1:3100/settings/features> (production) or <http://127.0.0.1:3000/settings/features> (development).
- Production file: `D:\NewModularProduct-Production\shared\config\features.json`. Every change is recorded in `features-audit.log` next to it.
- A change is saved straight away and applies on the next restart: Ctrl+C in the production window, then `Start-Production.ps1`.
- New features reach production switched off. When the file is first created, it copies the current `production.env` values, so nothing changes silently.
- A feature stays off until the features it needs are on. For example, "Send emails" needs "Gmail connection" and "Mailbox check".
- Turning on "Send emails" asks for confirmation. Duplicate protection and per-send clicks still apply.
- Features that the code limits to development (one-click send, Quality V2, cloud scheduling, template cover letter) are listed on the page but can't be switched on.
- If the file is unreadable, production starts with every toggled feature off and prints a `[FEATURE_TOGGLES] ERROR` line in the production log.

## Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs `tools/deploy/ci_verify.py` on Windows for every push to `master` and every pull request. That's the same verification `ship`, `checkpoint` and `deliver` run locally. Delivery itself always stays on this PC.

## Branching

- `master` is the production branch.
- Work on a short branch, merge it into `master`, then run `ship`.
- Small changes can be made on `master` directly. `ship` tests them before committing.
