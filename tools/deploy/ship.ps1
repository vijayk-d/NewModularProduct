<#
  ship.ps1  -  one command from development (port 3000) to production (port 3100)

    powershell -ExecutionPolicy Bypass -File tools\deploy\ship.ps1            # test, commit, push, deliver
    powershell -ExecutionPolicy Bypass -File tools\deploy\ship.ps1 -NoPush    # same, but don't push to GitHub
    powershell -ExecutionPolicy Bypass -File tools\deploy\ship.ps1 -TestOnly  # only run the full test suite (CI locally)

  Steps (stops at the first failure, nothing half-done):
    1. Checks: on master, development on port 3000 stopped, not behind origin/master.
    2. If there are uncommitted changes: plan + checkpoint (all Node, Python and Playwright tests) -> commit.
    3. Pushes master (GitHub Actions then re-runs the same tests on Windows).
    4. Delivers HEAD to production unless production already runs it; waits for the health check.
  New features reach production switched OFF unless already on; switch them at http://127.0.0.1:3100/settings/features.
  Never sends email, never retries operations, never copies a database.
#>
param([switch]$NoPush, [switch]$TestOnly)
# Native tools write progress to stderr; failures are checked explicitly through exit codes.
$ErrorActionPreference = 'Continue'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location -LiteralPath $repo
$tool = Join-Path $repo 'tools\deploy\local_delivery.py'
$deliveryLogs = Join-Path $repo 'var\maintenance\delivery'
$python = if (Get-Command py -ErrorAction SilentlyContinue) { 'py' } else { 'python' }

function Step($text) { Write-Host "`n=== $text ===" -ForegroundColor Cyan }
function Stop-Ship($text) { Write-Host "`nSHIP STOPPED: $text" -ForegroundColor Red; exit 1 }
function Invoke-Py([string[]]$arguments) {
    $lines = @(); & $python @arguments 2>&1 | ForEach-Object { $line = "$_"; Write-Host $line; $lines += $line }
    return [pscustomobject]@{ Code = $LASTEXITCODE; Lines = $lines }
}
function Show-TestFailures {
    $log = Get-ChildItem -LiteralPath $deliveryLogs -Filter '*.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1
    if (-not $log) { return }
    Write-Host "`nFailures from $($log.FullName):" -ForegroundColor Yellow
    Select-String -LiteralPath $log.FullName -Pattern '^\s*not ok|✖|^\s+\d+\) \[|Error:' -Encoding UTF8 | Select-Object -First 40 | ForEach-Object { '  ' + $_.Line.Trim() }
}
function Test-Port($port) { [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }

# ---- 1. Pre-checks -------------------------------------------------------------
Step 'Checks'
if (Test-Port 3000) { Stop-Ship 'Development is running on port 3000. Stop it (Ctrl+C in its window), then run ship again.' }
if ($TestOnly) {
    Step 'Full test suite (same as CI)'
    $r = Invoke-Py @((Join-Path $repo 'tools\deploy\ci_verify.py'))
    if ($r.Code -ne 0) { Show-TestFailures; Stop-Ship 'Tests failed.' }
    Write-Host "`nALL TESTS PASSED." -ForegroundColor Green; exit 0
}
$branch = (git branch --show-current).Trim()
if ($branch -ne 'master') { Stop-Ship "You are on '$branch'. Production ships from master: git switch master; git merge $branch" }
git fetch --quiet origin master
if ($LASTEXITCODE -ne 0) { Stop-Ship 'git fetch failed (network or GitHub access).' }
$behind = [int](git rev-list --count HEAD..origin/master)
if ($behind -gt 0) { Stop-Ship "master is $behind commit(s) behind origin/master. Run: git pull --ff-only" }
Write-Host "On master, development stopped, up to date with origin."

# ---- 2. Commit tested changes ---------------------------------------------------
$dirty = @(git status --porcelain)
if ($dirty.Count -gt 0) {
    Step "Plan ($($dirty.Count) changed path(s))"
    $r = Invoke-Py @($tool, 'plan')
    $nothing = $r.Lines | Where-Object { $_ -like '*No source changes to checkpoint*' }
    if ($r.Code -ne 0 -and $nothing) { Write-Host 'Only files outside the release allow-list changed; shipping the current commit.' -ForegroundColor Yellow }
    elseif ($r.Code -ne 0) { Stop-Ship 'Plan refused the changes (see the message above). Nothing was committed.' }
  if (-not $nothing) {
    $planLine = $r.Lines | Where-Object { $_ -like 'PLAN: *' } | Select-Object -Last 1
    if (-not $planLine) { Stop-Ship 'Could not find the plan file in the output.' }
    $plan = $planLine.Substring(6).Trim()
    $review = [IO.Path]::ChangeExtension($plan, '.md')
    $excluded = Select-String -LiteralPath $review -Pattern '^## Excluded untracked files' -Context 0,50 -ErrorAction SilentlyContinue
    if ($excluded) { $list = $excluded.Context.PostContext | Where-Object { $_ -like '- *' }; if ($list) { Write-Host 'Not included (not on the release allow-list):' -ForegroundColor Yellow; $list | ForEach-Object { "  $_" } } }
    Step 'Checkpoint: full test suite, then commit'
    $r = Invoke-Py @($tool, 'checkpoint', '--plan', $plan)
    if ($r.Code -ne 0) { Show-TestFailures; Stop-Ship 'Checkpoint failed. Nothing was committed or delivered.' }
  }
} else {
    Write-Host 'No uncommitted changes; shipping the current master commit.'
}
$head = (git rev-parse HEAD).Trim()
Write-Host "Commit: $(git log -1 --oneline)"

# ---- 3. Push --------------------------------------------------------------------
if (-not $NoPush) {
    Step 'Push to GitHub'
    git push origin master
    if ($LASTEXITCODE -ne 0) { Stop-Ship 'git push failed. Nothing was delivered.' }
    foreach ($tag in @(git tag --points-at HEAD)) { if ($tag) { git push origin "refs/tags/$tag" 2>&1 | Out-Null } }
}

# ---- 4. Deliver -----------------------------------------------------------------
Step 'Deliver to production'
$statusJson = (& $python $tool status 2>$null) -join "`n"
$active = $null; try { $active = ($statusJson | ConvertFrom-Json).active.commit } catch { }
if ($active -eq $head) {
    Write-Host "Production already runs $head - nothing to deliver."
} else {
    $r = Invoke-Py @($tool, 'deliver', '--ref', 'HEAD')
    if ($r.Code -ne 0) { Stop-Ship 'Delivery failed; production keeps running the previous release. See the report path above.' }
}

# ---- 5. Make sure production is running the new commit ---------------------------
Step 'Health check'
$startScript = Join-Path $PSScriptRoot 'Start-Production.ps1'
$ok = $false
for ($i = 0; $i -lt 45 -and -not $ok; $i++) {
    try { $h = Invoke-RestMethod -Uri 'http://127.0.0.1:3100/healthz' -TimeoutSec 3; $ok = ($h.release -eq $head) } catch { }
    if (-not $ok -and $i -eq 5 -and -not (Test-Port 3100)) {
        Write-Host 'Production is not running; starting it safely.'
        & powershell -NoProfile -ExecutionPolicy Bypass -File $startScript | Out-Host
    }
    if (-not $ok) { Start-Sleep -Seconds 2 }
}
if (-not $ok) { Stop-Ship "Production is not serving $head yet. Run: powershell -ExecutionPolicy Bypass -File tools\deploy\Start-Production.ps1 -StatusOnly" }
Write-Host "`nSHIPPED: production serves $head" -ForegroundColor Green
Write-Host 'Feature toggles: http://127.0.0.1:3100/settings/features'
Write-Host 'You can start development on port 3000 again.'
