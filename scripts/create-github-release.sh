#!/bin/bash

# GitHub Release Creation Script for Ebdaa Work Time v1.0.0

echo "🚀 GitHub Release Creation Guide - Ebdaa Work Time v1.0.0"
echo "==========================================================="
echo ""

echo "📁 Files ready for upload:"
echo "--------------------------"
ls -lh public/downloads/EbdaaWorkTime-*.dmg public/downloads/EbdaaWorkTime-*.exe
echo ""

echo "🔗 STEP 1: Go to GitHub Releases"
echo "https://github.com/ItzAmeerHamza/alyson-pms/releases"
echo ""

echo "🎯 STEP 2: Click 'Create a new release'"
echo ""

echo "🏷️  STEP 3: Fill in release details:"
echo "  • Tag version: v1.0.0"
echo "  • Release title: Ebdaa Work Time v1.0.0 - Desktop Applications"
echo "  • Target: main branch"
echo ""

echo "📝 STEP 4: Release Description (copy this):"
echo "----------------------------------------"
cat << 'EOF'
# Ebdaa Work Time v1.0.0 - Desktop Applications

## 🎉 First Official Release

Professional employee time tracking desktop applications with enterprise-grade features.

### 📦 Downloads Available

- **EbdaaWorkTime-ARM.dmg** (114MB) - macOS Apple Silicon (M1/M2/M3 Macs)
- **EbdaaWorkTime-Intel.dmg** (119MB) - macOS Intel (x86_64 Macs)  
- **EbdaaWorkTime-Setup.exe** (85MB) - Windows 10/11 (x64)

### ✨ Features

- 📸 **Smart Screenshot Capture** - 2 screenshots per 10-minute period at random intervals
- ⏱️ **Precise Time Tracking** - Automatic start/stop with idle detection
- 📊 **Activity Monitoring** - Track mouse, keyboard, and application usage
- 🔄 **Real-time Sync** - Seamless integration with web dashboard
- 🛡️ **Enterprise Security** - Code-signed applications with crash protection
- 🎯 **Intelligent Detection** - Automatic OS detection and optimized downloads

### 📋 Installation Instructions

#### macOS:
1. Download the appropriate DMG file for your Mac
2. Open the DMG file
3. Drag "Ebdaa Work Time.app" to your Applications folder
4. Launch from Applications (NOT from the DMG)

#### Windows:
1. Download EbdaaWorkTime-Setup.exe
2. Right-click and "Run as administrator"
3. Follow the installation wizard

### 🔧 Technical Details

- **Built with:** Electron 28.3.3, React, TypeScript
- **Platforms:** macOS 10.12+, Windows 10+
- **Architecture:** Universal binaries (ARM64 + x86_64)
- **Signing:** Code-signed with verified Developer ID certificate

### 🆘 Support

For technical support or installation issues, contact your system administrator.

---
**RevCloud © 2025**
EOF
echo "----------------------------------------"
echo ""

echo "📎 STEP 5: Upload these files to the release:"
echo "  1. EbdaaWorkTime-ARM.dmg"
echo "  2. EbdaaWorkTime-Intel.dmg"
echo "  3. EbdaaWorkTime-Setup.exe"
echo ""

echo "✅ STEP 6: Publish the release"
echo ""

echo "🎯 After publishing, the download URLs will be:"
echo "  • ARM DMG: https://github.com/ItzAmeerHamza/alyson-pms/releases/download/v1.0.0/EbdaaWorkTime-ARM.dmg"
echo "  • Intel DMG: https://github.com/ItzAmeerHamza/alyson-pms/releases/download/v1.0.0/EbdaaWorkTime-Intel.dmg"
echo "  • Windows EXE: https://github.com/ItzAmeerHamza/alyson-pms/releases/download/v1.0.0/EbdaaWorkTime-Setup.exe"
echo ""

echo "🔧 The website is already configured to use these URLs!"
echo "Once you publish the release, the corruption issue will be completely resolved."
echo ""

echo "💡 Pro tip: You can also set this as a 'Pre-release' initially to test the downloads." 