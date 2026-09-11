@echo off
setlocal
cd /d "%~dp0"

echo Building Media Notes Workbench Windows installer...
call npm.cmd run package:windows:compile
if errorlevel 1 (
  echo.
  echo Build failed. Review the error above.
  pause
  exit /b 1
)

echo.
echo Installer generated under release\windows\<version>\installer\
pause
