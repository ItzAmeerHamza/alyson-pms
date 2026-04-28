@echo off
echo.
echo ========================================
echo   KILLING ALL ELECTRON PROCESSES
echo ========================================
echo.
echo You have 5 Electron.exe processes running!
echo The old app (v1.0.110) is still running.
echo.
echo Killing all Electron processes...
taskkill /F /IM electron.exe /T
echo.
echo ✅ All Electron processes killed
echo.
echo Now run: .\run-direct.bat
echo.
pause









