@echo off
echo 🏗️ Building Local Windows Executable with Desktop Window Detection
echo ================================================================

echo 📋 Current Directory: %CD%
echo 🔧 Node Version: 
node --version
echo 📦 NPM Version:
npm --version

echo.
echo 🛠️ Step 1: Generate build configuration...
node generate-env-config.js --build
if %errorlevel% neq 0 (
    echo ❌ Failed to generate config
    pause
    exit /b 1
)

echo.
echo 🧹 Step 2: Clean previous build...
if exist dist rmdir /s /q dist
if exist build rmdir /s /q build

echo.
echo 📦 Step 3: Install/rebuild dependencies...
npm install --silent
if %errorlevel% neq 0 (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo 🏗️ Step 4: Build Windows executable...
echo This may take several minutes...
set ELECTRON_BUILDER_CACHE=.\\cache
npx electron-builder --win --x64 --publish never
if %errorlevel% neq 0 (
    echo ❌ Build failed
    pause
    exit /b 1
)

echo.
echo ✅ BUILD COMPLETE!
echo 📁 Executable location: dist\
dir dist\*.exe /b 2>nul
if %errorlevel% equ 0 (
    echo.
    echo 🎉 SUCCESS: Windows executable built successfully!
    echo 🚀 You can now test the desktop window detection in the .exe
    echo.
    echo 💡 The executable will include:
    echo    - New desktop window detection system
    echo    - Fallback to legacy app detection if needed
    echo    - All integrated changes for better window tracking
    echo.
    echo 🧪 To test window detection, run the exe and check logs
) else (
    echo ❌ No executable found in dist folder
)

echo.
pause

