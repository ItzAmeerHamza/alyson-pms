@echo off
REM TimeFlow Desktop Agent - Full Logging (Batch Version)
REM Double-click this file to start the agent with full logging

cd /d "%~dp0"

echo ============================================
echo TimeFlow Desktop Agent - Full Logging Mode
echo ============================================
echo.

REM Set timestamp for log file
set "timestamp=%date:~10,4%-%date:~4,2%-%date:~7,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%"
set "timestamp=%timestamp: =0%"
set "logfile=full-logs-%timestamp%.log"

echo [1/4] Killing existing processes...
taskkill /F /IM "ebdaa-work-time.exe" 2>nul
timeout /t 2 /nobreak >nul
echo       Done
echo.

echo [2/4] Setting debug environment variables...
set TIMEFLOW_LOG_LEVEL=debug
set LOG_LEVEL=debug
set DEBUG_INPUT=1
set DEBUG_APP=1
set ELECTRON_ENABLE_LOGGING=1
echo       Done
echo.

echo [3/4] Starting desktop agent...
echo       Log file: %logfile%
echo.
echo ============================================
echo Desktop Agent Running...
echo Press Ctrl+C to stop
echo ============================================
echo.

REM Start with output redirection
npm run start 2>&1 | tee %logfile%

echo.
echo ============================================
echo Desktop Agent Stopped
echo Logs saved to: %logfile%
echo ============================================
echo.
pause


