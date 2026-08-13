@echo off
setlocal
cd /d "%~dp0"

echo Starting Media Notes Workbench...
call wscript.exe "%~dp0scripts\run-hidden.vbs" npm.cmd run start:windows
if errorlevel 1 goto failed

echo Media Notes Workbench is ready.
exit /b 0

:failed
echo.
echo Startup failed. Check logs\dev-windows-console.log and logs\dev.std.log.
pause
exit /b 1
