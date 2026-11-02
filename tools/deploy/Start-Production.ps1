<#
  Start-Production.ps1  -  safe start for NewModularProduct production (port 3100)

  Fixes "ERROR: Supervisor lock exists" every time:
    * Production already running  -> does NOT start a second copy; just checks health.
    * Lock left behind (window closed with X, PC restart, crash)
                                   -> moves the stale lock aside (kept as evidence) and starts production.
    * Port 3100 held by an orphaned production node.exe
                                   -> stops it only if you pass -StopOrphan.

  Usage (from D:\monorepo\NewModularProduct):
    powershell -ExecutionPolicy Bypass -File tools\deploy\Start-Production.ps1
    powershell -ExecutionPolicy Bypass -File tools\deploy\Start-Production.ps1 -StopOrphan
    powershell -ExecutionPolicy Bypass -File tools\deploy\Start-Production.ps1 -StatusOnly

  Never deletes data, never touches the database, queues, schedules or Gmail.
#>
param(
    [string]$ProductionRoot = 'D:\NewModularProduct-Production',
    [string]$SourceRoot     = 'D:\monorepo\NewModularProduct',
    [switch]$StopOrphan,
    [switch]$StatusOnly
)
$ErrorActionPreference = 'Stop'
$lock      = Join-Path $ProductionRoot 'supervisor.lock'
$statusFile= Join-Path $ProductionRoot 'supervisor-status.json'
$launcher  = Join-Path $ProductionRoot 'start-production.bat'
$healthUrl = 'http://127.0.0.1:3100/healthz'

function Get-Health {
    try { Invoke-RestMethod -Uri $healthUrl -TimeoutSec 5 } catch { $null }
}
function Show-Health($h) {
    if ($h) { Write-Host "HEALTH OK - production is answering:" -ForegroundColor Green; $h | ConvertTo-Json -Depth 4 }
    else    { Write-Host "HEALTH FAILED - nothing answering on $healthUrl" -ForegroundColor Red }
}
function Get-PortOwner {
    $c = Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)" } else { $null }
}

# ---- 1. Read lock + supervisor status ----------------------------------------
$lockPid = $null; $supAlive = $false; $fresh = $false; $status = $null
if (Test-Path -LiteralPath $lock) {
    $raw = (Get-Content -LiteralPath $lock -Raw -ErrorAction SilentlyContinue)
    if ($raw -match '^\s*(\d+)\s*$') { $lockPid = [int]$Matches[1] }
    if ($lockPid) {
        $p = Get-CimInstance Win32_Process -Filter "ProcessId=$lockPid" -ErrorAction SilentlyContinue
        $supAlive = [bool]($p -and $p.Name -match '^python' -and $p.CommandLine -match 'serve')
    }
}
if (Test-Path -LiteralPath $statusFile) {
    $status = Get-Content -LiteralPath $statusFile -Raw | ConvertFrom-Json
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $fresh = ($status.heartbeat -and ($now - [double]$status.heartbeat) -lt 15)
}
Write-Host "Lock file      : $(if (Test-Path -LiteralPath $lock) {'present (PID ' + $lockPid + ')'} else {'none'})"
Write-Host "Supervisor PID : $(if ($supAlive) {'alive'} else {'not running'})"
Write-Host "Heartbeat      : $(if ($fresh) {'fresh (mode ' + $status.mode + ', commit ' + $status.commit + ')'} else {'stale or missing'})"

# ---- 2. Already running? Then never start a second copy ----------------------
if ($supAlive -and $fresh) {
    Write-Host "`nProduction is ALREADY RUNNING. Not starting another copy." -ForegroundColor Yellow
    Show-Health (Get-Health); return
}
if ($StatusOnly) { Show-Health (Get-Health); return }
if ($supAlive -and -not $fresh) {
    Write-Host "`nSupervisor process $lockPid exists but its heartbeat is stale (it may be paused mid-delivery)." -ForegroundColor Red
    Write-Host "Check its console window, or run: py `"$SourceRoot\tools\deploy\local_delivery.py`" status"
    Write-Host "Nothing changed."; return
}

# ---- 3. Port 3100 must be free -----------------------------------------------
$owner = Get-PortOwner
if ($owner) {
    $isOurs = $owner.Name -eq 'node.exe' -and $owner.CommandLine -match [regex]::Escape("$ProductionRoot\releases")
    Write-Host "`nPort 3100 is held by PID $($owner.ProcessId): $($owner.Name)" -ForegroundColor Yellow
    Write-Host "  $($owner.CommandLine)"
    if ($isOurs -and $StopOrphan) {
        Stop-Process -Id $owner.ProcessId -Force; Start-Sleep -Seconds 2
        if (Get-PortOwner) { Write-Host 'Port still busy - stop here.' -ForegroundColor Red; return }
        Write-Host 'Orphaned production server stopped.' -ForegroundColor Green
    } elseif ($isOurs) {
        Write-Host 'This is an orphaned production server (its supervisor is gone). Re-run with -StopOrphan to stop it and restart cleanly.'; return
    } else {
        Write-Host 'Not a production server process - not touching it. Close it yourself, then re-run.' -ForegroundColor Red; return
    }
}

# ---- 4. Move stale lock aside (kept for inspection, never silently deleted) --
if (Test-Path -LiteralPath $lock) {
    $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
    $dest  = Join-Path $ProductionRoot "supervisor.lock.stale-$stamp"
    Move-Item -LiteralPath $lock -Destination $dest
    Write-Host "Stale lock moved to: $dest" -ForegroundColor Green
}

# ---- 5. Start production in its own window and verify ------------------------
if (-not (Test-Path -LiteralPath $launcher)) { throw "Launcher missing: $launcher" }
Start-Process -FilePath $launcher -WorkingDirectory $ProductionRoot
Write-Host 'Production window opened. Keep it open (Ctrl+C in that window = clean shutdown).'
$h = $null
for ($i = 0; $i -lt 30 -and -not $h; $i++) { Start-Sleep -Seconds 1; $h = Get-Health }
Show-Health $h
