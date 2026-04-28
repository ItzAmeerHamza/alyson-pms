@echo off
echo ============================================
echo   Quick Build Script for ebdaa-work-time
echo ============================================
echo.

REM Change to script directory
cd /d "%~dp0"

echo [1/3] Generating env-config.js...
node generate-env-config.js --build
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to generate env-config.js
    pause
    exit /b 1
)
echo   [OK] env-config.js generated
echo.

echo [2/3] Building app with electron-builder...
echo   This will take several minutes...
echo.
node_modules\.bin\electron-builder.cmd --win --x64
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Build failed
    echo.
    echo Trying with npx...
    call npx electron-builder --win --x64
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Build failed with npx too
        pause
        exit /b 1
    )
)

echo.
echo [3/3] Checking output...
if exist "dist\*.exe" (
    echo [OK] Build successful!
    echo.
    dir dist\*.exe
) else (
    echo [!] No installer found in dist folder
)

echo.
echo ============================================
echo   Build Complete!
echo ============================================
echo.
echo Next steps:
echo   1. Uninstall old "Ebdaa Work Time" version
echo   2. Install new version from dist folder
echo.
pause
