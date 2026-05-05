@echo off
echo.
echo ============================================
echo   REBUILDING WITH NATIVE MODULE FIX
echo ============================================
echo.

cd /d "%~dp0"

echo [1/3] Cleaning previous build...
if exist dist (
    rmdir /s /q dist
    echo   [OK] dist folder cleaned
) else (
    echo   [OK] No previous build to clean
)
echo.

echo [2/3] Generating env-config...
node generate-env-config.js --build
if %ERRORLEVEL% NEQ 0 (
    echo   [FAILED] Could not generate env-config.js
    pause
    exit /b 1
)
echo   [OK] env-config.js generated
echo.

echo [3/3] Building with native module unpacking...
echo.
echo   This includes:
echo   - screenshot-desktop (CRITICAL FIX)
echo   - active-win
echo   - keytar
echo.
echo   Build will take 5-10 minutes...
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
echo   BUILD COMPLETE!
echo ============================================
echo.

if exist "dist\alyson-work-time Setup 95.3.4.exe" (
    echo [OK] Installer created successfully
    for %%F in ("dist\alyson-work-time Setup 95.3.4.exe") do (
        set /a "size_mb=%%~zF / 1048576"
    )
    echo   File: alyson-work-time Setup 95.3.4.exe
    echo.
    
    echo Verifying native modules were unpacked...
    if exist "dist\win-unpacked\resources\app.asar.unpacked\node_modules\screenshot-desktop" (
        echo   [OK] screenshot-desktop unpacked - CRASH FIX APPLIED!
    ) else (
        echo   [!] screenshot-desktop NOT unpacked - build may still crash
    )
    
    if exist "dist\win-unpacked\resources\app.asar.unpacked\node_modules\active-win" (
        echo   [OK] active-win unpacked
    ) else (
        echo   [!] active-win NOT unpacked
    )
    
    echo.
    echo Opening dist folder...
    start explorer dist
) else (
    echo [!] Installer not found
)

echo.
pause
