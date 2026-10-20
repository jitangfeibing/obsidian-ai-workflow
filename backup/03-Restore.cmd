@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Restore.ps1"
if errorlevel 1 echo Operation did not finish. See the message above.
pause
