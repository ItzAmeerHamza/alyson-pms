@echo off
echo Waiting for file locks to clear...
timeout /t 3 /nobreak >nul

cd /d "%~dp0"

taskkill /F /IM ebdaa-work-time.exe 2>nul
timeout /t 2 /nobreak >nul

echo Replacing app.asar...
move /Y "dist\win-unpacked\resources\app.asar" "dist\win-unpacked\resources\app.asar.old" 2>nul
move /Y "dist\win-unpacked\resources\app-new.asar" "dist\win-unpacked\resources\app.asar"

if exist "dist\win-unpacked\resources\app.asar" (
    echo SUCCESS: app.asar replaced!
    echo Starting application...
    start "" "dist\win-unpacked\ebdaa-work-time.exe"
) else (
    echo ERROR: Failed to replace app.asar
    pause
)

timeout /t 2 /nobreak >nul


