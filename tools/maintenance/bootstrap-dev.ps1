<#
  bootstrap-dev.ps1  -  create a working development environment (port 3000) in minutes.

  Fresh PC:
    winget install --id Git.Git -e; winget install --id OpenJS.NodeJS -e; winget install --id Python.Python.3.13 -e
    git clone https://github.com/vijayk-d/NewModularProduct.git D:\monorepo\NewModularProduct
    cd D:\monorepo\NewModularProduct
    powershell -ExecutionPolicy Bypass -File tools\maintenance\bootstrap-dev.ps1
    .\start-local-server.bat          # then open http://127.0.0.1:3000/maintenance

  Safe to re-run: existing .env, templates, inventory and private folders are never overwritten.
  Never touches production, never sends email, never copies databases.
#>
param(
    [string]$PrivateRoot = (Join-Path $env:USERPROFILE 'NewModularProduct-private'),
    [switch]$SkipBrowsers,
    [switch]$SkipTests
)
$ErrorActionPreference = 'Continue'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location -LiteralPath $repo
$problems = @()
function Step($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Ok($t) { Write-Host "  OK   $t" -ForegroundColor Green }
function Warn($t) { Write-Host "  WARN $t" -ForegroundColor Yellow }
function Bad($t) { Write-Host "  FAIL $t" -ForegroundColor Red; $script:problems += $t }
function Get-Version($exe, $arg) { try { ((& $exe $arg 2>&1) | Select-Object -First 1).ToString().Trim() } catch { $null } }

# ---- 1. Prerequisites ---------------------------------------------------------------
Step 'Prerequisites'
$git = Get-Version 'git' '--version'; if ($git) { Ok $git } else { Bad 'Git missing: winget install --id Git.Git -e' }
$nodeV = Get-Version 'node' '--version'
if ($nodeV -and [int]($nodeV.TrimStart('v').Split('.')[0]) -ge 24) { Ok "Node $nodeV" } else { Bad "Node 24+ required (found: $nodeV). winget install --id OpenJS.NodeJS -e" }
$pyCmd = if (Get-Command py -ErrorAction SilentlyContinue) { 'py' } elseif (Get-Command python -ErrorAction SilentlyContinue) { 'python' } else { $null }
$pyV = if ($pyCmd) { Get-Version $pyCmd '--version' } else { $null }
if ($pyV -match 'Python 3\.(\d+)' -and [int]$Matches[1] -ge 11) { Ok $pyV } else { Bad "Python 3.11+ required (found: $pyV). winget install --id Python.Python.3.13 -e" }
if ($problems.Count) { Write-Host "`nInstall the missing tools, open a NEW PowerShell window and re-run." -ForegroundColor Red; exit 1 }

# ---- 2. Node dependencies -----------------------------------------------------------
Step 'Node packages (npm ci)'
npm ci --no-audit --no-fund
if ($LASTEXITCODE -eq 0) { Ok 'node_modules installed from package-lock.json' } else { Bad 'npm ci failed' }

# ---- 3. Python virtual environment --------------------------------------------------
Step 'Python workers (.venv)'
$venvPy = Join-Path $repo '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $venvPy)) { & $pyCmd -m venv .venv }
if (Test-Path -LiteralPath $venvPy) {
    & $venvPy -m pip install --disable-pip-version-check -q -r tools\deploy\requirements.lock.txt
    if ($LASTEXITCODE -eq 0) { & $venvPy -m pip check | Out-Null; Ok "Python packages installed ($venvPy)" } else { Bad 'pip install failed' }
} else { Bad 'Could not create .venv' }

# ---- 4. Private folders (outside the repo) ------------------------------------------
Step "Private folders: $PrivateRoot"
$cvFolder = Join-Path $PrivateRoot 'cv'; $inventory = Join-Path $PrivateRoot 'cv-inventory.json'
New-Item -ItemType Directory -Force -Path $cvFolder | Out-Null
if (-not (Test-Path -LiteralPath $inventory)) { Copy-Item -LiteralPath 'examples\cv-semantic-inventory.example.json' -Destination $inventory; Warn "Created example CV inventory: $inventory (edit it to list your CVs)" } else { Ok "CV inventory exists: $inventory" }
Ok "CV folder: $cvFolder (put one subfolder per role code, e.g. PM\cv.pdf)"

# ---- 5. Template ---------------------------------------------------------------------
Step 'Cover-letter template'
New-Item -ItemType Directory -Force -Path 'templates' | Out-Null
if (-not (Test-Path -LiteralPath 'templates\standard-cover-letter.md')) { Copy-Item -LiteralPath 'tools\deploy\assets\standard-cover-letter.md' -Destination 'templates\standard-cover-letter.md'; Ok 'templates\standard-cover-letter.md created from the versioned asset' } else { Ok 'templates\standard-cover-letter.md exists (kept)' }

# ---- 6. .env -------------------------------------------------------------------------
Step '.env (development settings)'
if (-not (Test-Path -LiteralPath '.env')) {
    $text = [IO.File]::ReadAllText((Join-Path $repo 'examples\env.development.example.txt'))
    $text = $text.Replace('C:\Users\YOU\NewModularProduct-private\cv-inventory.json', $inventory).Replace('C:\Users\YOU\NewModularProduct-private\cv', $cvFolder)
    $text = $text -replace '(?m)^PYTHON=$', ('PYTHON=' + $venvPy)
    $text = $text -replace '(?m)^CANDIDATE_DISPLAY_NAME=Your Name$', ('CANDIDATE_DISPLAY_NAME=' + $env:USERNAME)
    [IO.File]::WriteAllText((Join-Path $repo '.env'), $text, [Text.UTF8Encoding]::new($false))
    Ok '.env created with every integration OFF. Edit CANDIDATE_DISPLAY_NAME and add keys only when needed.'
} else {
    Ok '.env exists (kept). Compare with examples\env.development.example.txt for new settings:'
    $have = (Get-Content -LiteralPath '.env') -replace '=.*$', '' | Where-Object { $_ -match '^[A-Z]' }
    $want = (Get-Content -LiteralPath 'examples\env.development.example.txt') -replace '=.*$', '' | Where-Object { $_ -match '^[A-Z]' }
    $missing = $want | Where-Object { $have -notcontains $_ }
    if ($missing) { Warn ('Not in your .env (defaults apply): ' + ($missing -join ', ')) } else { Ok 'All template settings present.' }
}

# ---- 7. Playwright browser -----------------------------------------------------------
if (-not $SkipBrowsers) {
    Step 'Playwright Chromium (UI tests)'
    npx playwright install chromium
    if ($LASTEXITCODE -eq 0) { Ok 'Chromium ready' } else { Warn 'Playwright browser install failed (UI tests only).' }
}

# ---- 8. Quick tests -----------------------------------------------------------------
if (-not $SkipTests) {
    Step 'Quick smoke tests'
    node --test tests/config/feature-toggles.test.js tests/application/maintenance-commands.test.js
    if ($LASTEXITCODE -eq 0) { Ok 'Smoke tests passed' } else { Bad 'Smoke tests failed' }
}

# ---- Summary -------------------------------------------------------------------------
Step 'Result'
if ($problems.Count) { Write-Host ('Finished with problems: ' + ($problems -join '; ')) -ForegroundColor Red; exit 1 }
Write-Host 'Development environment ready.' -ForegroundColor Green
Write-Host '  Start:        .\start-local-server.bat'
Write-Host '  Library:      http://127.0.0.1:3000/maintenance'
Write-Host '  Full tests:   tools\deploy\ship.cmd -TestOnly   (stop development first)'
Write-Host '  Production:   one-time setup in docs\developer-setup.md (section "Production on this PC")'
