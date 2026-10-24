param([string]$ProjectRoot = 'D:\monorepo\NewModularProduct')
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $ProjectRoot).Path.TrimEnd('\')
$files = @()
foreach ($folder in @('src','tests','templates','public')) {
    $dir = Join-Path $root $folder
    if (Test-Path -LiteralPath $dir) {
        $files += Get-ChildItem -LiteralPath $dir -Recurse -File | Where-Object {
            $_.Extension -in @('.js','.mjs','.cjs','.json','.css','.html','.md','.ts') -and
            $_.FullName -notmatch '[\\/](node_modules|data|backups|test-results|playwright-report|fixtures)[\\/]' -and
            $_.Name -notmatch '(?i)(credential|secret|token|\.env)'
        }
    }
}
foreach ($name in @('package.json','package-lock.json','playwright.config.js','playwright.contacts.config.js')) {
    $p = Join-Path $root $name
    if (Test-Path -LiteralPath $p) { $files += Get-Item -LiteralPath $p }
}
$records = @($files | Sort-Object FullName -Unique | ForEach-Object {
    [ordered]@{
        path = $_.FullName.Substring($root.Length + 1).Replace('\','/')
        content = [IO.File]::ReadAllText($_.FullName)
        sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
})
$gitHead = & git -C $root rev-parse HEAD 2>$null
$gitStatus = & git -C $root status --short 2>$null
$docDir = Join-Path $root 'docs'
if (-not (Test-Path -LiteralPath $docDir)) { throw 'Expected docs directory does not exist.' }
$dest = Join-Path $docDir ('urgent-ui-source-' + (Get-Date -Format 'yyyyMMddTHHmmss') + '.json')
$payload = [ordered]@{ capturedAt = (Get-Date).ToUniversalTime().ToString('o'); head = "$gitHead"; status = @($gitStatus); files = $records }
[IO.File]::WriteAllText($dest, ($payload | ConvertTo-Json -Depth 8), (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Created source snapshot: $dest"
Write-Host "Files captured: $($records.Count). Review the JSON for private content before uploading."
Write-Host 'No application source, database, environment configuration or running server was changed.'
