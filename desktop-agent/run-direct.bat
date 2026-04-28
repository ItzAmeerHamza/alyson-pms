@echo off
echo ==========================================
echo   Starting TimeFlow Agent (Direct Mode)
echo ==========================================

REM Kill any existing instances of electron.exe (safe for development)
taskkill /F /IM "electron.exe" 2>nul

REM Set debug flags to help diagnose white screen
set DEBUG=true
set ELECTRON_ENABLE_LOGGING=true

REM Check if Electron exists in the expected location
if exist "node_modules\electron\dist\electron.exe" (
    echo Found Electron binary, starting...
    "node_modules\electron\dist\electron.exe" .
) else (
    echo Electron binary not found!
    echo Please run: npm install
    pause
    exit /b 1
)

pause










