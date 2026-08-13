@echo off
setlocal
cd /d "%~dp0"

echo Stopping Media Notes Workbench...
call wscript.exe "%~dp0scripts\run-hidden.vbs" npm.cmd run stop:windows
if errorlevel 1 goto failed

echo Media Notes Workbench has stopped.
exit /b 0

:failed
echo.
echo Stop failed. Review the error above.
pause
exit /b 1
