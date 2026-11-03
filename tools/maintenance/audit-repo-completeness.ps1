<#
  audit-repo-completeness.ps1  -  what exists on THIS PC but not in GitHub?  (read-only)

    powershell -ExecutionPolicy Bypass -File tools\maintenance\audit-repo-completeness.ps1

  Lists code, scripts and documents that are untracked or gitignored, so nothing the app needs
  lives only on one machine. Private data (CVs, databases, .env, output, logs, backups) is
  reported as "expected local only" and its contents are never read or printed.
  Changes nothing: no staging, no commits, no deletes.
#>
$ErrorActionPreference = 'Continue'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location -LiteralPath $repo
# (run "git fetch origin" first for accurate ahead/behind counts)

$codeExt = '\.(js|mjs|cjs|py|ps1|bat|cmd|psm1|ts|css|html|json|md|txt|yml|yaml|toml|gs|sql)$'
$privatePattern = '(^|/)(\.env($|\.)|output/|data/|var/|evidence/|node_modules/|\.venv/|test-results/|playwright-report/|blob-report/|__pycache__/|coverage/)|\.(db|sqlite3?|pdf|docx|log|bak|backup|zip|pem|key|pfx)$|\.before-|\.corrupted-backup$|\.before-recovery$'

$entries = @(git status --porcelain=v1 --ignored --untracked-files=all) | ForEach-Object {
    $code = $_.Substring(0, 2); $path = $_.Substring(3).Trim('"')
    [pscustomobject]@{ State = $(if ($code -eq '!!') { 'ignored' } elseif ($code -eq '??') { 'untracked' } else { 'modified' }); Path = $path }
}
$modified = $entries | Where-Object State -eq 'modified'
$local = $entries | Where-Object { $_.State -ne 'modified' }
$private = $local | Where-Object { $_.Path -match $privatePattern }
$candidates = $local | Where-Object { $_.Path -notmatch $privatePattern -and $_.Path -match $codeExt }
$other = $local | Where-Object { $_.Path -notmatch $privatePattern -and $_.Path -notmatch $codeExt }

Write-Host "`n=== Repository: $repo ===" -ForegroundColor Cyan
Write-Host "Branch: $(git branch --show-current)   HEAD: $(git log -1 --format='%h %s')"
$ahead = git rev-list --count origin/master..HEAD 2>$null; $behind = git rev-list --count HEAD..origin/master 2>$null
Write-Host "Versus origin/master: $ahead ahead, $behind behind (ahead = commits not yet on GitHub)"

Write-Host "`n=== 1. Code/docs that exist ONLY on this PC (review: commit or delete) - $(@($candidates).Count) ===" -ForegroundColor Yellow
$candidates | Group-Object { $p = $_.Path -split '/'; if ($p.Count -gt 2) { $p[0] + '/' + $p[1] } else { $p[0] } } | Sort-Object Name | ForEach-Object {
    Write-Host ("  {0}  ({1} file(s))" -f $_.Name, $_.Count)
    $_.Group | Select-Object -First 8 | ForEach-Object { Write-Host ("      [{0}] {1}" -f $_.State, $_.Path) }
    if ($_.Count -gt 8) { Write-Host "      ... $($_.Count - 8) more" }
}

Write-Host "`n=== 2. Tracked files with uncommitted changes - $(@($modified).Count) ===" -ForegroundColor Yellow
$modified | Select-Object -First 30 | ForEach-Object { Write-Host "  $($_.Path)" }

Write-Host "`n=== 3. Other local files (not code) - $(@($other).Count) ===" -ForegroundColor Gray
$other | Group-Object { ($_.Path -split '/')[0] } | Sort-Object Count -Descending | Select-Object -First 15 | ForEach-Object { Write-Host ("  {0}: {1}" -f $_.Name, $_.Count) }

Write-Host "`n=== 4. Expected local only (private data, never committed) - $(@($private).Count) ===" -ForegroundColor Green
$private | Group-Object { ($_.Path -split '/')[0] } | Sort-Object Count -Descending | Select-Object -First 15 | ForEach-Object { Write-Host ("  {0}: {1}" -f $_.Name, $_.Count) }

Write-Host "`n=== 5. References to files that are not in the repository ===" -ForegroundColor Yellow
$tracked = @{}; git ls-files | ForEach-Object { $tracked[$_] = $true }
$refs = Select-String -Path 'src\application\maintenance-commands.js', 'docs\*.md', 'tools\deploy\*.md', 'tools\maintenance\*.md', '*.md' -Pattern '(tools|scripts|docs|src)[\\/][A-Za-z0-9_.\\/-]+\.(py|ps1|mjs|js|md|bat|cmd)' -AllMatches -ErrorAction SilentlyContinue |
    ForEach-Object { foreach ($m in $_.Matches) { $m.Value -replace '[\\/]+', '/' } } | Sort-Object -Unique
$missing = $refs | Where-Object { -not $tracked.ContainsKey($_) }
if ($missing) { $missing | ForEach-Object { $state = if ($_ -like 'tools/patches/*') { 'one-time patch package, intentionally not in Git (.gitignore)' } elseif (Test-Path -LiteralPath $_) { 'exists locally, NOT in GitHub - commit it' } else { 'missing everywhere' }; Write-Host "  $_  ->  $state" } } else { Write-Host '  None.' }

Write-Host "`nNothing was changed. Paste sections 1, 2 and 5 to decide what to commit." -ForegroundColor Cyan
