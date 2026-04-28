@echo off
echo ============================================
echo   Building ebdaa-work-time
echo ============================================
echo.

cd /d "%~dp0"

echo [1/2] Generating env-config.js...
node generate-env-config.js --build
if %ERRORLEVEL% NEQ 0 (
    echo [FAILED] Could not generate env-config.js
    pause
    exit /b 1
)
echo [OK] env-config.js generated
echo.

echo [2/2] Building application...
echo This will take 5-10 minutes. Please wait...
echo.

node node_modules\electron-builder\out\cli\cli.js --win --x64

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [FAILED] Build failed with error code %ERRORLEVEL%
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Build Complete!
echo ============================================
echo.

if exist dist (
    echo Checking dist folder...
    dir dist\*.exe
    echo.
    echo Opening dist folder...
    start explorer dist
)

pause
