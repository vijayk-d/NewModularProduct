# Deploy an already-tested Git commit using the existing local_delivery.py controller.
# Does not commit, push, initialise/reseed data, edit .env files, or enable integrations.
[CmdletBinding()]
param(
    [string]$Ref = 'HEAD',
    [string]$ProjectRoot = 'D:\monorepo\NewModularProduct',
    [string]$ProductionRoot = 'D:\NewModularProduct-Production'
)

$ErrorActionPreference = 'Stop'
$previousRoot = $env:NMP_SOURCE_ROOT
$pushed = $false
$resultCode = 0

try {
    $ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
    $ProductionRoot = (Resolve-Path -LiteralPath $ProductionRoot).Path
    $controller = Join-Path $ProjectRoot 'tools\deploy\local_delivery.py'
    $launcher = Join-Path $ProductionRoot 'start-production.bat'
    $activePath = Join-Path $ProductionRoot 'active.json'
    $lockPath = Join-Path $ProductionRoot 'supervisor.lock'

    foreach ($file in @($controller, $launcher, (Join-Path $ProductionRoot 'shared\config\production.env'))) {
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
            throw "Required deployment file missing: $file. No initialisation or seeding will be attempted."
        }
    }
    Get-Command git -ErrorAction Stop | Out-Null
    Get-Command py -ErrorAction Stop | Out-Null
    Push-Location -LiteralPath $ProjectRoot
    $pushed = $true
    $env:NMP_SOURCE_ROOT = $ProjectRoot

    $commit = & git rev-parse --verify --end-of-options "${Ref}^{commit}"
    if ($LASTEXITCODE -ne 0 -or @($commit).Count -ne 1) {
        throw 'Cannot resolve the requested Git commit.'
    }
    $commit = $commit.Trim()
    if ($commit -notmatch '^[0-9a-f]{40,64}$') { throw 'Unexpected Git commit identifier.' }

    $changes = @(& git status --porcelain --untracked-files=no -- .)
    if ($LASTEXITCODE -ne 0) { throw 'Could not check the working tree.' }
    if ($changes.Count -gt 0) {
        throw 'There are staged or unstaged tracked changes. Review and commit your tested improvements first. Nothing was deployed.'
    }
    $untracked = @(& git ls-files --others --exclude-standard -- .)
    if ($LASTEXITCODE -ne 0) { throw 'Could not check untracked files.' }
    if ($untracked.Count -gt 0) {
        Write-Warning "$($untracked.Count) untracked file(s) will NOT be deployed. Commit any new feature files before proceeding."
    }

    $active = $null
    if (Test-Path -LiteralPath $activePath) {
        $active = Get-Content -LiteralPath $activePath -Raw -Encoding UTF8 | ConvertFrom-Json
    }
    if (-not $active -or $active.commit -ne $commit) {
        $probe = New-Object System.Net.Sockets.TcpClient
        $developmentRunning = $false
        try { $probe.Connect('127.0.0.1', 3000); $developmentRunning = $true }
        catch { $developmentRunning = $false }
        finally { $probe.Dispose() }
        if ($developmentRunning) {
            throw 'Stop the development server on port 3000 first. Leave an existing production supervisor open. Nothing was deployed.'
        }
    }

    Write-Host ''
    Write-Host "Release commit:   $commit"
    Write-Host "Production root: $ProductionRoot"
    Write-Host 'The existing delivery command will install dependencies, verify the release, back up data and promote it.'
    Write-Host 'Existing production configuration and data will be retained.'
    $approval = Read-Host 'Type DEPLOY to continue'
    if ($approval -ne 'DEPLOY') {
        Write-Host 'Cancelled. No delivery or launch performed.'
    }
    else {
        & py $controller --production-root $ProductionRoot deliver --ref $commit
        if ($LASTEXITCODE -ne 0) {
            throw 'Delivery failed. Stop and inspect the reported log. A failed candidate is retained; this script will not delete or overwrite it.'
        }

        $active = Get-Content -LiteralPath $activePath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($active.commit -ne $commit) { throw 'The active release differs from the requested commit. Stop and inspect production status.' }

        if (-not (Test-Path -LiteralPath $lockPath)) {
            Write-Host 'Starting the production supervisor in a separate window. Keep that window open.'
            Start-Process -FilePath $launcher -WorkingDirectory $ProductionRoot | Out-Null
        }
        else {
            Write-Host 'Production supervisor lock exists; not starting a second instance.'
        }

        & py $controller --production-root $ProductionRoot health
        if ($LASTEXITCODE -ne 0) {
            throw 'Production health failed. Inspect the production window and shared\logs. Do not launch a second instance or delete locks automatically.'
        }
        $active = Get-Content -LiteralPath $activePath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($active.commit -ne $commit) { throw 'Another deployment changed the active release during verification.' }

        Write-Host ''
        Write-Host "DEPLOYMENT COMPLETE: $commit" -ForegroundColor Green
        Write-Host 'Production: http://127.0.0.1:3100'
        Write-Host 'No Git commit/push, data reseeding, configuration change or integration enablement was performed by this wrapper.'
    }
}
catch {
    Write-Host ''
    Write-Host ('DEPLOYMENT STOPPED: ' + $_.Exception.Message) -ForegroundColor Red
    $resultCode = 1
}
finally {
    if ($pushed) { Pop-Location }
    if ($null -eq $previousRoot) {
        Remove-Item Env:NMP_SOURCE_ROOT -ErrorAction SilentlyContinue
    }
    else { $env:NMP_SOURCE_ROOT = $previousRoot }
}
exit $resultCode
