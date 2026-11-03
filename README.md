# NewModularProduct

Local job-application software: prepares role-specific CVs and cover letters from saved evidence, manages outreach drafts and contacts, and ships to a local production instance through one tested command.

| Environment | Address | Folder |
|---|---|---|
| Development | http://127.0.0.1:3000 | `D:\monorepo\NewModularProduct` (this repository) |
| Production | http://127.0.0.1:3100 | `D:\NewModularProduct-Production` (releases built from `master`) |

Every page has the same floating top bar (Applications, Outreach, Libraries, System) and an environment marker: green border and badge = Development, red border, badge and "PRODUCTION ·" tab title = Production, purple = release verification.

Everything you need, in one page: **http://127.0.0.1:3000/maintenance** (or 3100) — environments with live health, all pages, GitHub links, documentation and utilities.

## Five-minute setup (new PC)

```powershell
winget install --id Git.Git -e; winget install --id OpenJS.NodeJS -e; winget install --id Python.Python.3.13 -e
# open a NEW PowerShell window
git clone https://github.com/vijayk-d/NewModularProduct.git D:\monorepo\NewModularProduct
cd D:\monorepo\NewModularProduct
powershell -ExecutionPolicy Bypass -File tools\maintenance\bootstrap-dev.ps1
.\start-local-server.bat
```

Details, private data and the production setup: [docs/developer-setup.md](docs/developer-setup.md).

## Shipping

```powershell
tools\deploy\ship.cmd            # test -> commit -> push master -> deliver -> health
```

How often, feature toggles, hotfixes and rollback: [docs/cicd-guide.md](docs/cicd-guide.md). All commands: [docs/commands.md](docs/commands.md).

## Documentation map

- [Architecture](NewModularProduct-Architecture.md) and [decisions](docs/architecture-decisions.md)
- [Migration plan](NewModularProduct-Full-Migration-Plan.md), [plan status](NewModularProduct-Overall-Plan-Status.md), [implementation plan](IMPLEMENTATION_PLAN.md), [roadmap](docs/next-development-slices-roadmap.md)
- [Release tool](tools/deploy/README.md), [CI workflow](.github/workflows/ci.yml)
- [Settings template](examples/env.development.example.txt) — every setting the code reads

## Repository layout

| Path | Contents |
|---|---|
| `src/domain`, `src/application` | Business rules and use cases |
| `src/infrastructure` | SQLite stores, Gmail, Perplexity, PDF/DOCX adapters |
| `src/interfaces/http` | Local web server and pages |
| `src/config` | Settings, feature toggles, deployment runtime |
| `tests/` | Node tests (`node --test`), Playwright UI tests |
| `tools/deploy` | Release tool, `ship`, `Start-Production.ps1`, CI verification |
| `tools/maintenance` | Bootstrap, audits, configuration and diagnostic utilities |
| `examples/` | Settings and inventory templates (no private data) |

## What is never in Git

`.env`, `shared/config/production.env`, databases, CVs, generated output and logs. These stay on your PC by design; `.gitignore` enforces it. Run `tools\maintenance\audit-repo-completeness.ps1` to check nothing else is local-only.
