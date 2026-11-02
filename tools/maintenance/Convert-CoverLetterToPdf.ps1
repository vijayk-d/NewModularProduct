[CmdletBinding()]
param([switch]$Run)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$script:Stage='Preflight';$script:CleanupWarnings=@()
$self=$PSCommandPath
if ([string]::IsNullOrWhiteSpace($self)) { $self=$MyInvocation.MyCommand.Path }
if ([string]::IsNullOrWhiteSpace($self)) { throw 'Use -File with this exported conversion script.' }
$folder=[IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($self))
foreach ($blocked in @('D:\monorepo\NewModularProduct','D:\NewModularProduct-Production')) {
 if ($folder.Equals($blocked,[StringComparison]::OrdinalIgnoreCase) -or $folder.StartsWith($blocked+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Extract the application pack outside development and production before conversion.' }
}
if ($env:OS -ne 'Windows_NT' -or [Threading.Thread]::CurrentThread.ApartmentState -ne 'STA') { throw 'Use Windows PowerShell -STA on an interactive desktop.' }
$manifestPath=Join-Path $folder 'cover-letter-export.json'
$inputPath=Join-Path $folder 'cover-letter.docx'
$manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.formatVersion -ne 1 -or $manifest.templateSha256 -ne '40899a69660c0752defb1e81a29264996c28219e8cd0d44f7a9ec8d0e0df4314' -or $manifest.docxSha256 -notmatch '^[a-f0-9]{64}$') { throw 'Unsupported export manifest.' }
$before=(Get-FileHash -LiteralPath $inputPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($before -ne $manifest.docxSha256) { throw 'The exported letter was edited or replaced. Re-export it; conversion is blocked.' }
if (-not (Test-Path -LiteralPath 'Registry::HKEY_CLASSES_ROOT\Word.Application\CLSID')) { throw 'Microsoft Word is not registered.' }
if (-not $Run) { [pscustomobject]@{Status='PREFLIGHT PASSED - no Word instance started';DocxHashMatches=$true;ConversionTested=$false;NextAction='Rerun with -Run while present at the desktop.'} | ConvertTo-Json;return }
$runDir=Join-Path $folder ('pdf-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8))
$null=New-Item -ItemType Directory -Path $runDir
$copyPath=Join-Path $runDir 'cover-letter.docx';$pdfPath=Join-Path $runDir 'cover-letter.pdf';$reportPath=Join-Path $runDir 'conversion-report.json'
[IO.File]::WriteAllBytes($copyPath,[IO.File]::ReadAllBytes($inputPath))
function Invoke-Conversion([string]$File,[string]$Pdf) {
 $word=$null;$document=$null
 try {
  $script:Stage='CreateWordApplication';$word=New-Object -ComObject Word.Application;$word.Visible=$true;$word.DisplayAlerts=0;$word.AutomationSecurity=3
  $script:Stage='OpenExportedDocx';[object]$fileName=$File;[object]$confirm=$false;[object]$readOnly=$true;[object]$recent=$false
  $document=$word.Documents.Open([ref]$fileName,[ref]$confirm,[ref]$readOnly,[ref]$recent)
  $version=[string]$word.Version;$script:Stage='ExportPdf';$document.ExportAsFixedFormat($Pdf,17);return $version
 } finally {
  if ($null -ne $document) {
   try { [object]$save=0;$document.Close([ref]$save) } catch { $script:CleanupWarnings+=('Document.Close: '+$_.Exception.Message) }
   finally { try { if ([Runtime.InteropServices.Marshal]::IsComObject($document)) { $null=[Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) } } catch { $script:CleanupWarnings+=('Document release: '+$_.Exception.Message) } }
  }
  if ($null -ne $word) {
   try { [object]$save=0;$word.Quit([ref]$save) } catch { $script:CleanupWarnings+=('Word.Quit: '+$_.Exception.Message) }
   finally { try { if ([Runtime.InteropServices.Marshal]::IsComObject($word)) { $null=[Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) } } catch { $script:CleanupWarnings+=('Application release: '+$_.Exception.Message) } }
  }
 }
}
$exitCode=0
try {
 $version=Invoke-Conversion $copyPath $pdfPath;$script:Stage='ValidateOutput';$bytes=[IO.File]::ReadAllBytes($pdfPath)
 if ($bytes.Length -lt 5 -or [Text.Encoding]::ASCII.GetString($bytes,0,5) -ne '%PDF-') { throw 'Missing or invalid PDF output.' }
 if ((Get-FileHash -LiteralPath $inputPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $before -or (Get-FileHash -LiteralPath $copyPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $before) { throw 'The Word document changed during conversion.' }
 $result=[pscustomobject]@{Status=$(if ($script:CleanupWarnings.Count -eq 0) { 'CONVERSION PASSED - visual review still required' } else { 'CONVERSION COMPLETED - cleanup requires review' });WordVersion=$version;WordDocument=$copyPath;PdfDocument=$pdfPath;InputUnchanged=$true;VisualLayoutVerified=$false;CleanupWarnings=@($script:CleanupWarnings);SourceManifestSha256=(Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant();PdfSha256=(Get-FileHash -LiteralPath $pdfPath -Algorithm SHA256).Hash.ToLowerInvariant()}
} catch {
 $exitCode=1;$result=[pscustomobject]@{Status='FAILED - original export unchanged';Stage=$script:Stage;Error=$_.Exception.Message;ScriptPosition=$_.InvocationInfo.PositionMessage;ScriptStackTrace=$_.ScriptStackTrace;CleanupWarnings=@($script:CleanupWarnings);ResultsDirectory=$runDir}
} finally { [GC]::Collect();[GC]::WaitForPendingFinalizers();[GC]::Collect();[GC]::WaitForPendingFinalizers() }
if ($script:CleanupWarnings.Count -gt 0) { $exitCode=1 }
$json=$result | ConvertTo-Json -Depth 6;[IO.File]::WriteAllText($reportPath,$json,(New-Object Text.UTF8Encoding($false)));Write-Output $json;exit $exitCode
