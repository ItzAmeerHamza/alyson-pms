@echo off
echo.
echo ========================================
echo   RESTART REQUIRED - OLD CODE RUNNING
echo ========================================
echo.
echo Current app is running OLD detection code (version 1.0.110).
echo The NEW cached detection is NOT loaded yet.
echo.
echo To load the NEW CODE:
echo   1. Close the Electron app window (X button)
echo   2. Run: .\run-direct.bat
echo.
echo After restart, you will see:
echo   [APP-CACHE] Initialized with 3000 ms TTL
echo   [WINDOWS-APP] Using active-win (native Windows API) as PRIMARY method
echo   [WINDOWS-APP] Simple detection succeeded: Google Chrome
echo.
echo Then check App Detection screen - it should show:
echo   - "Google Chrome" (when Edge/Chrome is open)
echo   - "Microsoft Edge" (when Edge is active)
echo   - NOT "Cursor" when other apps are open
echo.
pause









