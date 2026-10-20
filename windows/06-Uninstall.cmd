@echo off
setlocal
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Manage.ps1" -Action Uninstall
if errorlevel 1 (
  echo.
  echo Operation failed. Read the error above, then press a key.
)
echo.
pause
endlocal
