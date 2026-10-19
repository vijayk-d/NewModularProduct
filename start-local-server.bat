@echo off
setlocal EnableExtensions DisableDelayedExpansion
pushd "%~dp0"
if errorlevel 1 exit /b 1
if exist "release.json" (
  echo ERROR: This is a production release. Use the production launcher.
  popd
  exit /b 1
)
where node.exe >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js 24+ is required on PATH.
  popd
  exit /b 1
)
if not exist "tools\maintenance\start-development.mjs" (
  echo ERROR: Development launcher helper is missing.
  popd
  exit /b 1
)
node.exe "tools\maintenance\start-development.mjs"
set "launcherExit=%ERRORLEVEL%"
popd
endlocal & exit /b %launcherExit%
