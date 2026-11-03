# One-off, offline COPY. Originals remain in place for rollback.
[CmdletBinding()]
param(
    [string]$DevRoot = 'D:\monorepo\NewModularProduct',
    [string]$SharedDir
)
$ErrorActionPreference = 'Stop'

function Read-DevelopmentEnv([string]$File) {
    $values = @{}
    if (Test-Path -LiteralPath $File) {
        foreach ($line in Get-Content -LiteralPath $File) {
            if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
                $key = $Matches[1]
                $value = $Matches[2]
                if ($value.Length -ge 2 -and
                    (($value.StartsWith('"') -and $value.EndsWith('"')) -or
                     ($value.StartsWith("'") -and $value.EndsWith("'")))) {
                    $value = $value.Substring(1, $value.Length - 2)
                } else {
                    $value = ($value -replace '\s+#.*$', '').Trim()
                }
                $values[$key] = $value
            }
        }
    }
    return $values
}

$DevRoot = [IO.Path]::GetFullPath($DevRoot)
$settings = Read-DevelopmentEnv (Join-Path $DevRoot '.env')
if (-not $SharedDir) { $SharedDir = $settings['NMP_CV_LIBRARY_DIRECTORY'] }
if (-not $SharedDir -or -not [IO.Path]::IsPathRooted($SharedDir)) {
    throw 'Supply an absolute -SharedDir or set NMP_CV_LIBRARY_DIRECTORY in development .env.'
}
$SharedDir = [IO.Path]::GetFullPath($SharedDir)
$devPrefix = $DevRoot.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
if ($SharedDir -eq $DevRoot -or $SharedDir.StartsWith($devPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Shared storage must be outside the development checkout.'
}

if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
    foreach ($port in @(3000, 3100)) {
        $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
        if ($listeners.Count -gt 0) { throw "Stop the server/supervisor on port $port before copying evidence." }
    }
} else {
    Write-Warning 'Get-NetTCPConnection is unavailable. Independently confirm BOTH servers are stopped before continuing.'
    $answer = Read-Host 'Have you confirmed development AND production are stopped? Type STOPPED to continue'
    if ($answer -cne 'STOPPED') { throw 'Offline migration was not confirmed.' }
}

$name = 'assignment-evidence-library-v1.db'
$candidates = @()
if ($settings['NMP_STATE_DIRECTORY']) {
    $state = $settings['NMP_STATE_DIRECTORY']
    if (-not [IO.Path]::IsPathRooted($state)) { $state = Join-Path $DevRoot $state }
    $state = [IO.Path]::GetFullPath($state)
    # Never read/back up a state directory belonging to a production installation.
    if ($state -ne $DevRoot -and -not $state.StartsWith($devPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Configured development state is outside DevRoot; review it manually. No production data folders are accessed.'
    }
    $candidates += Join-Path $state $name
}
$candidates += Join-Path (Join-Path $DevRoot 'output') $name
$sources = @($candidates | Select-Object -Unique | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })
if ($sources.Count -ne 1) {
    throw "Expected exactly one development evidence database; found $($sources.Count). Resolve missing/ambiguous source before retrying."
}
$source = $sources[0]
$destination = Join-Path $SharedDir 'evidence'
$target = Join-Path $destination $name
foreach ($suffix in @('', '-wal', '-shm')) {
    if (Test-Path -LiteralPath ($target + $suffix)) { throw "Refusing to overwrite shared evidence: $target$suffix" }
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fffffff'
# Back up the complete SQLite file set together before creating the shared copy.
foreach ($suffix in @('', '-wal', '-shm')) {
    $file = $source + $suffix
    if (Test-Path -LiteralPath $file -PathType Leaf) {
        Copy-Item -LiteralPath $file -Destination ($source + '.backup-' + $stamp + $suffix) -ErrorAction Stop
    }
}
New-Item -ItemType Directory -Path $destination -Force | Out-Null
foreach ($suffix in @('', '-wal', '-shm')) {
    $file = $source + $suffix
    if (Test-Path -LiteralPath $file -PathType Leaf) {
        # File.Copy's default overwrite=false also protects against a concurrent migration.
        [IO.File]::Copy($file, ($target + $suffix), $false)
    }
}
Write-Host "Copied development evidence to $target"
Write-Host "Original preserved at $source; timestamped backup: $source.backup-$stamp"
Write-Host 'Next: configure the same NMP_CV_LIBRARY_DIRECTORY for BOTH environments.'
Write-Host 'Restart development and check /evidence-library. Stop development again before tools\deploy\ship.cmd.'
Write-Host 'After shipping, enable Evidence library in production Settings and restart production normally.'
Write-Host 'Both environments will edit the same library. Do not rerun migration or overwrite newer shared data.'
