@echo off
setlocal
set "NMP_ENV=development"

cd /d "%~dp0"

echo.
echo Starting local application server...
echo.

node --env-file=.env src\interfaces\http\run-local-server.js

echo.
echo The local server stopped or could not start.
echo Review the message above, then press any key to close this window.
pause >nul