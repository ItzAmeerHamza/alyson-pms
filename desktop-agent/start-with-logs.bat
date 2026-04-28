@echo off
cd /d "%~dp0"
echo ================================================================
echo   STARTING DESKTOP AGENT WITH CONSOLE LOGGING
echo ================================================================
echo.
echo Starting app...
echo.
node_modules\.bin\electron.cmd .
echo.
echo App closed. Press any key to exit...
pause > nul

