@echo off
setlocal
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install.ps1" -ResetKeys
if errorlevel 1 (
  echo.
  echo Operation failed. Read the error above, then press a key.
)
echo.
pause
endlocal
