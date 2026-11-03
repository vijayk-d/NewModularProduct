# CI/CD guide: development to production, and rollback

## The pipeline

```
feature branch / master on 3000  ->  ship.cmd  ->  GitHub master + Actions  ->  production 3100
                                      (tests, commit, push, deliver, health)
```

| Stage | Where | What runs |
|---|---|---|
| Develop | `D:\monorepo\NewModularProduct`, port 3000 | `.\start-local-server.bat` |
| Verify | your PC | `ship.cmd` runs every Node, Python and Playwright test in a clean copy |
| Integrate | GitHub | push to `master`; Actions re-runs the same verification on Windows (`.github/workflows/ci.yml`) |
| Deliver | your PC | release tool builds `releases\<commit>`, smoke-tests it on 3200/3201, switches production, checks `/healthz` |
| Release control | production | features ship OFF; switch on at http://127.0.0.1:3100/settings/features |

Delivery always happens locally, because production lives on your PC. GitHub is the source of truth for code and documents.

## How often to ship

Ship whenever tests pass and a change is useful — several times a day is fine. Small, frequent ships are safer than big ones: each release is easy to test, easy to understand and easy to roll back.

Rules of thumb:

- one feature or fix per ship;
- unfinished work goes behind a feature toggle (off in production) rather than waiting on a long branch;
- ship before switching to a different piece of work.

## Everyday flow

```powershell
cd D:\monorepo\NewModularProduct
git switch master
git pull --ff-only
# ... develop on 3000, try it in the browser ...
# Ctrl+C the development window, then:
tools\deploy\ship.cmd
```

`ship` stops at the first failure, so nothing is half-delivered. It refuses to run when you aren't on `master`, development still holds port 3000, or `master` is behind GitHub. If production already runs the commit, it skips delivery. Check GitHub Actions afterwards on the repository's Actions tab (also linked from `/maintenance`).

### Optional: short branches

For bigger work:

```powershell
git switch -c feat/my-change
# ... commit with git add <paths> ...
git push -u origin feat/my-change            # open a pull request; CI runs on it
# after CI is green, merge the pull request on GitHub, then:
git switch master; git pull --ff-only; tools\deploy\ship.cmd
```

Keep branches to a day or two. Long branches drift and conflict.

## Feature toggles

- New features land in production switched OFF.
- Switch them on at http://127.0.0.1:3100/settings/features, then restart production (Ctrl+C in its window, then `Start-Production.ps1`).
- Every change is recorded in `shared\config\features-audit.log`.
- A feature can't be switched on until the features it needs are on (sending needs Gmail and mailbox check).
- Development-only features (one-click send, Quality V2, cloud scheduling, template cover letter) cannot be switched on in production.
- Switching a feature off is the fastest "rollback" for a feature problem — no redeploy needed.

When adding a feature that should be toggleable, add it to `src/config/feature-toggles.js` (`FEATURES`, default off) and a test in `tests/config/feature-toggles.test.js`.

## Hotfix

```powershell
git switch master; git pull --ff-only
# fix + test locally on 3000
tools\deploy\ship.cmd
```

Same pipeline, just a small change. Don't skip tests; if `ship` fails, production is untouched.

## Rollback

Choose the lightest option that solves the problem:

1. Feature problem: switch the feature off at `/settings/features` and restart production.
2. Code problem, fast: return production to the previous release.

   ```powershell
   py tools\deploy\local_delivery.py status      # shows active and previous release
   py tools\deploy\local_delivery.py rollback    # previous release, after a smoke test on a copy
   py tools\deploy\local_delivery.py health
   ```

   Rollback changes code only. It backs up `shared\data` first and refuses if the previous release would change the database schema. It never touches Gmail and never resends anything.
3. Make it permanent: undo the commit on `master` so the next ship doesn't bring it back.

   ```powershell
   git switch master; git pull --ff-only
   git revert <bad-commit>       # creates a new commit; never reset --hard or push --force
   tools\deploy\ship.cmd
   ```

## What CI does

On every push to `master` and every pull request, GitHub Actions (Windows, Node 24, Python 3.13) runs `tools/deploy/ci_verify.py`: copies the release files to a temporary folder, runs `npm ci`, installs Python packages, then every Node test, the Python worker tests, the release-tool tests and the Playwright release suite — the same checks as `ship`. The log is uploaded as the `verification-log` artifact.

## When something fails

| Failure | What to do |
|---|---|
| `ship` tests fail | Nothing changed. Read the first failing test, fix, re-run `ship`. |
| `ship` says development is running | Ctrl+C the development window. |
| `ship` says master is behind | `git pull --ff-only`, then ship. |
| Push fails | Production untouched. Fix the network/credentials and run `git push origin master`, or rerun ship. |
| Deliver fails | Production keeps running the previous release. Check `py tools\deploy\local_delivery.py status`. |
| Health fails after deliver | `py tools\deploy\local_delivery.py rollback`, then investigate. |
| CI red but local green | Open the run on the Actions tab, download `verification-log`, fix, ship again. |
| `Supervisor lock exists` | `powershell -ExecutionPolicy Bypass -File tools\deploy\Start-Production.ps1` |

## Never

- copy a database file over production (use the import tools; `--seed` is first-time only);
- `git add .`, `git reset --hard`, `git push --force`;
- commit `.env`, `production.env`, databases or CVs;
- retry Gmail operations or send email from a script.
