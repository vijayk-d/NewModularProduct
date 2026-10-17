@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0."
if errorlevel 1 goto :failed
set "HELPER=%~dp0tools\maintenance\root_workflow.py"
if not exist "%HELPER%" (
  echo STOPPED: The shared Python helper was not found.
  echo Expected helper: "%HELPER%"
  echo Keep tools, maintenance, and root_workflow.py in the original package layout.
  goto :failed
)
where py >nul 2>&1
if errorlevel 1 (
  echo STOPPED: The Python launcher py was not found.
  goto :failed
)
echo.
echo DEPLOY PRODUCTION - committed version only
echo.
py -B "%HELPER%" deploy --root "%~dp0."
if errorlevel 1 goto :failed
echo.
pause
exit /b 0
:failed
echo.
echo Action stopped. No automatic reset or cleanup was performed.
pause
exit /b 1
