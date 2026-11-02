@echo off
rem Ship development to production: tests, commit, push, deliver. See ship.ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ship.ps1" %*
