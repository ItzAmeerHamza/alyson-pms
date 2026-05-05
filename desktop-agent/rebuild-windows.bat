@echo off
echo ======================================
echo   Rebuilding Desktop Agent for Windows
echo   With Activity Sync Fix
echo ======================================
echo.

REM Clean previous builds
echo [1/5] Cleaning previous builds...
if exist dist rmdir /s /q dist
if exist "release\win-unpacked" rmdir /s /q "release\win-unpacked"
echo Done!
echo.

REM Regenerate config
echo [2/5] Regenerating configuration...
call npm run build:config
if errorlevel 1 (
    echo ERROR: Config generation failed!
    pause
    exit /b 1
)
echo Done!
echo.

REM Install dependencies (if needed)
echo [3/5] Checking dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: Dependency installation failed!
    pause
    exit /b 1
)
echo Done!
echo.

REM Build for Windows
echo [4/5] Building for Windows...
call npm run build:win
if errorlevel 1 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)
echo Done!
echo.

REM Package for Windows
echo [5/5] Packaging Windows executable...
call npm run dist:win
if errorlevel 1 (
    echo ERROR: Packaging failed!
    pause
    exit /b 1
)
echo Done!
echo.

echo ======================================
echo   Build Complete!
echo ======================================
echo.
echo The Windows executable is located at:
echo   release\win-unpacked\alyson-work-time-agent.exe
echo.
echo To install:
echo   1. Close the current running agent if open
echo   2. Run the new executable from the release folder
echo   3. Test activity tracking with mouse/keyboard
echo.
echo The fix includes:
echo   - Proper activity synchronization on Windows
echo   - Enhanced focus calculation
echo   - Better activity data capture from renderer
echo.
pause
