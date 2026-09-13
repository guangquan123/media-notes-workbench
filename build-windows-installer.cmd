@echo off
setlocal
cd /d "%~dp0"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  set "portableNodeRoot=%~dp0.tmp\node-portable"
  if exist "%portableNodeRoot%\" for /f "delims=" %%D in ('dir /b /ad "%portableNodeRoot%\node-*-win-x64" 2^>nul') do (
    if exist "%portableNodeRoot%\%%D\npm.cmd" set "PATH=%portableNodeRoot%\%%D;%PATH%"
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
