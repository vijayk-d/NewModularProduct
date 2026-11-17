# Converts one tailored CV (DOCX) to PDF with Microsoft Word on this PC, exactly as Word would print it.
# Called by the app after each tailored CV build. Opens the file read-only, never saves the DOCX, always quits Word.
# Output: one JSON line on stdout: {"ok":true,"wordVersion":"16.0"} or {"ok":false,"code":"..."}.
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Docx,
  [Parameter(Mandatory = $true)][string]$Pdf
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Result([hashtable]$Value) { [Console]::Out.WriteLine(($Value | ConvertTo-Json -Compress)) }

if (-not (Test-Path -LiteralPath $Docx -PathType Leaf) -or [IO.Path]::GetExtension($Docx) -ne '.docx') { Write-Result @{ ok = $false; code = 'PDF_INPUT_INVALID' }; exit 2 }
if (Test-Path -LiteralPath $Pdf) { Write-Result @{ ok = $false; code = 'PDF_OUTPUT_EXISTS' }; exit 2 }
if (-not (Test-Path -LiteralPath 'Registry::HKEY_CLASSES_ROOT\Word.Application\CLSID')) { Write-Result @{ ok = $false; code = 'WORD_NOT_INSTALLED' }; exit 3 }

$word = $null; $document = $null; $code = 'WORD_CONVERSION_FAILED'
try {
  $code = 'WORD_START_FAILED'
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $word.AutomationSecurity = 3
  $code = 'WORD_OPEN_FAILED'
  # Documents.Open(FileName, ConfirmConversions, ReadOnly, AddToRecentFiles)
  $document = $word.Documents.Open($Docx, $false, $true, $false)
  $code = 'WORD_EXPORT_FAILED'
  $document.ExportAsFixedFormat($Pdf, 17)
  $version = [string]$word.Version
  Write-Result @{ ok = $true; wordVersion = $version }
  $code = ''
}
catch { Write-Result @{ ok = $false; code = $code } }
finally {
  # Word's COM methods need [ref] arguments from PowerShell; 0 = do not save changes.
  if ($null -ne $document) { try { $document.Close([ref]0) } catch { try { $document.Close() } catch {} } ; try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document) } catch {} }
  if ($null -ne $word) { try { $word.Quit([ref]0) } catch { try { $word.Quit() } catch {} } ; try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word) } catch {} }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
if ($code) { exit 1 }
exit 0
