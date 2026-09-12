@echo off
setlocal
cd /d "%~dp0"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  for /d %%D in ("%~dp0.tmp\node-portable\node-*-win-x64") do (
    if exist "%%~fD\npm.cmd" set "PATH=%%~fD;%PATH%"
  )
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Node.js with npm was not found.
  echo Install Node.js 22 or extract the portable build under:
  echo   .tmp\node-portable\node-v22.x.x-win-x64
  pause
  exit /b 1
)

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
