@echo off
setlocal
cd /d "%~dp0"

set "LAUNCHER=%~dp0scripts\workbench-launcher.hta"
set "MSHTA=%SystemRoot%\System32\mshta.exe"

if not exist "%LAUNCHER%" goto missing_launcher

echo Opening the startup window...
start "" /wait "%MSHTA%" "%LAUNCHER%" start
set "LAUNCHER_EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %LAUNCHER_EXIT_CODE%

:missing_launcher
echo.
echo Startup window was not found: %LAUNCHER%
pause
exit /b 1
