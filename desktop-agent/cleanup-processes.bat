@echo off
echo ==========================================
echo   EMERGENCY CLEANUP - FREEING RESOURCES
echo ==========================================

echo Killing stuck PowerShell processes...
taskkill /F /IM powershell.exe /T 2>nul

echo Killing stuck cmd.exe processes...
taskkill /F /IM cmd.exe /T 2>nul

echo Killing stuck tasklist.exe processes...
taskkill /F /IM tasklist.exe /T 2>nul

echo Killing stuck python processes...
taskkill /F /IM python.exe /T 2>nul

echo Killing stuck Electron processes...
taskkill /F /IM electron.exe /T 2>nul

echo.
echo ==========================================
echo   CLEANUP COMPLETE - RESOURCES FREED
echo ==========================================
echo.
pause









