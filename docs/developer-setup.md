# Developer setup

Goal: from a fresh Windows PC to development on port 3000 in minutes, and production on port 3100 when you need it.

## 1. Prerequisites

| Tool | Version | Why |
|---|---|---|
| Git | any recent | source control |
| Node.js | 24 or newer | the app uses `node:sqlite` and `--env-file` |
| Python | 3.11+ (CI uses 3.13) | release tool and workers |

```powershell
winget install --id Git.Git -e; winget install --id OpenJS.NodeJS -e; winget install --id Python.Python.3.13 -e
```

Open a new PowerShell window afterwards so the tools are on PATH.

## 2. Clone and bootstrap

```powershell
git clone https://github.com/vijayk-d/NewModularProduct.git D:\monorepo\NewModularProduct
cd D:\monorepo\NewModularProduct
powershell -ExecutionPolicy Bypass -File tools\maintenance\bootstrap-dev.ps1
```

`bootstrap-dev.ps1` is safe to re-run. It:

1. checks Git, Node 24+ and Python 3.11+;
2. runs `npm ci` (exact versions from `package-lock.json`);
3. creates `.venv` and installs `tools/deploy/requirements.lock.txt`;
4. creates private folders outside the repo (default `%USERPROFILE%\NewModularProduct-private\cv` and `cv-inventory.json` from `examples/cv-semantic-inventory.example.json`);
5. creates `templates\standard-cover-letter.md` from `tools/deploy/assets/` if missing;
6. creates `.env` from `examples/env.development.example.txt` with every integration OFF (an existing `.env` is never changed; it lists settings you don't have yet);
7. installs Playwright Chromium and runs smoke tests.

Options: `-PrivateRoot D:\private` (other private folder), `-SkipBrowsers`, `-SkipTests`.

## 3. Run development

```powershell
.\start-local-server.bat
```

Open http://127.0.0.1:3000/maintenance. Add your CVs to the CV folder (one subfolder per role code) and list them in the inventory.

## 4. Optional integrations (development)

All are off by default. Turn them on in `.env` or at http://127.0.0.1:3000/settings/features.

| Feature | Settings | Helper |
|---|---|---|
| Company research / refinement | `PERPLEXITY_API_KEY`, `ENABLE_PERPLEXITY_RESEARCH`, `ENABLE_COVER_LETTER_REFINEMENT` | `py tools\maintenance\enable_perplexity_runtime.py` |
| Gmail drafts / mailbox check | `ENABLE_GMAIL`, `GMAIL_*` | `py tools\maintenance\configure_development_env.py` |
| Gmail sending (never automatic) | `ENABLE_GMAIL_SENDING` | `py tools\maintenance\configure_gmail_sending.py` |

Keys stay in `.env`, which Git ignores.

## 5. Production on this PC (one time)

Production is a separate folder built from `master` by the release tool. Your existing production is already set up — skip this unless you are building a new PC.

```powershell
py tools\maintenance\bootstrap_local_production.py      # creates the folder layout and bootstrap marker
py tools\deploy\local_delivery.py init                   # empty production stores (add --seed ONLY on first setup to copy development data once)
tools\deploy\ship.cmd                                    # builds, verifies and delivers master
powershell -ExecutionPolicy Bypass -File tools\deploy\Start-Production.ps1
```

`init` creates `shared\config\production.env` from your development `.env` with every integration off. `--seed` is a one-time copy into empty production only; it is never a sync mechanism. Details: [tools/deploy/README.md](../tools/deploy/README.md).

## 6. Check nothing is local-only

```powershell
powershell -ExecutionPolicy Bypass -File tools\maintenance\audit-repo-completeness.ps1
```

It lists code and documents that exist on this PC but not in GitHub. Commit them by name (`git add path\to\file`), never `git add .`.

## Troubleshooting

| Problem | Fix |
|---|---|
| `Node.js 24+ is required` | `winget upgrade OpenJS.NodeJS`, new window |
| Port 3000 busy | Close the other development window (Ctrl+C) |
| `Supervisor lock exists` | `powershell -ExecutionPolicy Bypass -File tools\deploy\Start-Production.ps1` |
| UI tests fail to launch a browser | `npx playwright install chromium` |
| `/evidence-library` returns 503 | It needs its own configuration; other pages are unaffected |
