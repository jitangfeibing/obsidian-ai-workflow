@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Manage.ps1" -Action Status
if errorlevel 1 echo Operation did not finish. See the message above.
pause
