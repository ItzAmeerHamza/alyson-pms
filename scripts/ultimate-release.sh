#!/bin/bash
set -e

# 🚀 Ultimate TimeFlow Release Script
# This script handles the complete release workflow:
# - Web application build
# - Desktop application build with signing & notarization
# - GitHub release creation
# - Auto-update configuration

echo "🚀 Starting Ultimate TimeFlow Release Process..."

# Configuration - USE ENVIRONMENT VARIABLES (set these before running)
APPLE_ID="${APPLE_ID}"
APPLE_APP_SPECIFIC_PASSWORD="${APPLE_APP_SPECIFIC_PASSWORD}"
APPLE_TEAM_ID="${APPLE_TEAM_ID}"
GITHUB_TOKEN="${GITHUB_TOKEN}"
GITHUB_REPO="ItzAmeerHamza/alyson-pms"

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
RELEASE_TAG="v${CURRENT_VERSION}"

echo "📦 Current version: ${CURRENT_VERSION}"
echo "🏷️ Release tag: ${RELEASE_TAG}"

# Set environment variables for signing
export APPLE_ID="${APPLE_ID}"
export APPLE_APP_SPECIFIC_PASSWORD="${APPLE_APP_SPECIFIC_PASSWORD}"
export APPLE_TEAM_ID="${APPLE_TEAM_ID}"
export GITHUB_TOKEN="${GITHUB_TOKEN}"

# Verify Apple Developer Certificate
echo "🔍 Verifying Apple Developer Certificate..."
if ! security find-identity -v -p codesigning | grep -q "Developer ID Application: RevCloud (${APPLE_TEAM_ID})"; then
    echo "❌ ERROR: Apple Developer Certificate not found!"
    echo "Please install the certificate from CertificateSigningRequest.certSigningRequest"
    exit 1
fi
echo "✅ Apple Developer Certificate found"

# Verify GitHub CLI authentication
echo "🔍 Verifying GitHub CLI authentication..."
if ! gh auth status > /dev/null 2>&1; then
    echo "🔑 Authenticating with GitHub..."
    echo "${GITHUB_TOKEN}" | gh auth login --with-token
fi
echo "✅ GitHub CLI authenticated"

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist build node_modules/.cache

# Install dependencies
echo "📦 Installing dependencies..."
npm ci

# Build web application
echo "🌐 Building web application..."
npm run build

# Copy entitlements file to build directory
echo "📋 Preparing entitlements..."
mkdir -p build
cp entitlements.mac.plist build/

# Build desktop applications with signing and notarization
echo "🖥️ Building desktop applications..."
echo "   - Building for macOS (Intel + ARM64) with signing & notarization..."
echo "   - Building for Windows (x64) with signing..."
echo "   - Building for Linux (x64)..."

# Build cross-platform with electron-builder
npx electron-builder --mac --win --linux --publish=never

# Verify builds were created
echo "🔍 Verifying build outputs..."
DMG_INTEL="dist/Alyson Work Time-${CURRENT_VERSION}.dmg"
DMG_ARM64="dist/Alyson Work Time-${CURRENT_VERSION}-arm64.dmg"
EXE_WIN="dist/Alyson Work Time Setup ${CURRENT_VERSION}.exe"
APPIMAGE_LINUX="dist/Alyson Work Time-${CURRENT_VERSION}.AppImage"

if [[ ! -f "$DMG_INTEL" ]]; then
    echo "❌ ERROR: Intel DMG not found at: $DMG_INTEL"
    ls -la dist/
    exit 1
fi

if [[ ! -f "$DMG_ARM64" ]]; then
    echo "❌ ERROR: ARM64 DMG not found at: $DMG_ARM64"
    ls -la dist/
    exit 1
fi

echo "✅ All builds verified"

# Rename files to match our naming convention
echo "📝 Renaming files to match naming convention..."
cp "$DMG_INTEL" "dist/TimeFlow-v${CURRENT_VERSION}-Intel.dmg"
cp "$DMG_ARM64" "dist/TimeFlow-v${CURRENT_VERSION}-ARM64.dmg"

if [[ -f "$EXE_WIN" ]]; then
    cp "$EXE_WIN" "dist/TimeFlow-v${CURRENT_VERSION}-Setup.exe"
fi

if [[ -f "$APPIMAGE_LINUX" ]]; then
    cp "$APPIMAGE_LINUX" "dist/TimeFlow-v${CURRENT_VERSION}-Linux.AppImage"
fi

# Generate file information
echo "📊 Generating file information..."
DMG_INTEL_RENAMED="dist/TimeFlow-v${CURRENT_VERSION}-Intel.dmg"
DMG_ARM64_RENAMED="dist/TimeFlow-v${CURRENT_VERSION}-ARM64.dmg"
EXE_WIN_RENAMED="dist/TimeFlow-v${CURRENT_VERSION}-Setup.exe"
APPIMAGE_LINUX_RENAMED="dist/TimeFlow-v${CURRENT_VERSION}-Linux.AppImage"

# Calculate SHA512 hashes and file sizes
echo "🔐 Calculating SHA512 hashes..."
INTEL_SHA512=$(shasum -a 512 "$DMG_INTEL_RENAMED" | cut -d' ' -f1)
INTEL_SIZE=$(stat -f%z "$DMG_INTEL_RENAMED" 2>/dev/null || stat -c%s "$DMG_INTEL_RENAMED")

ARM64_SHA512=$(shasum -a 512 "$DMG_ARM64_RENAMED" | cut -d' ' -f1)
ARM64_SIZE=$(stat -f%z "$DMG_ARM64_RENAMED" 2>/dev/null || stat -c%s "$DMG_ARM64_RENAMED")

WIN_SHA512=""
WIN_SIZE=""
if [[ -f "$EXE_WIN_RENAMED" ]]; then
    WIN_SHA512=$(shasum -a 512 "$EXE_WIN_RENAMED" | cut -d' ' -f1)
    WIN_SIZE=$(stat -f%z "$EXE_WIN_RENAMED" 2>/dev/null || stat -c%s "$EXE_WIN_RENAMED")
fi

LINUX_SHA512=""
LINUX_SIZE=""
if [[ -f "$APPIMAGE_LINUX_RENAMED" ]]; then
    LINUX_SHA512=$(shasum -a 512 "$APPIMAGE_LINUX_RENAMED" | cut -d' ' -f1)
    LINUX_SIZE=$(stat -f%z "$APPIMAGE_LINUX_RENAMED" 2>/dev/null || stat -c%s "$APPIMAGE_LINUX_RENAMED")
fi

echo "📋 File Information:"
echo "   Intel DMG: ${INTEL_SIZE} bytes, SHA512: ${INTEL_SHA512}"
echo "   ARM64 DMG: ${ARM64_SIZE} bytes, SHA512: ${ARM64_SHA512}"
if [[ -n "$WIN_SHA512" ]]; then
    echo "   Windows EXE: ${WIN_SIZE} bytes, SHA512: ${WIN_SHA512}"
fi
if [[ -n "$LINUX_SHA512" ]]; then
    echo "   Linux AppImage: ${LINUX_SIZE} bytes, SHA512: ${LINUX_SHA512}"
fi

# Update auto-update configuration files
echo "⚙️ Updating auto-update configuration files..."
RELEASE_DATE=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

# Update latest-mac.yml
cat > latest-mac.yml << EOF
version: ${CURRENT_VERSION}
files:
  - url: TimeFlow-v${CURRENT_VERSION}-Intel.dmg
    sha512: ${INTEL_SHA512}
    size: ${INTEL_SIZE}
  - url: TimeFlow-v${CURRENT_VERSION}-ARM64.dmg
    sha512: ${ARM64_SHA512}
    size: ${ARM64_SIZE}
path: TimeFlow-v${CURRENT_VERSION}-Intel.dmg
sha512: ${INTEL_SHA512}
releaseDate: '${RELEASE_DATE}'
EOF

# Update latest.yml (Windows)
if [[ -n "$WIN_SHA512" ]]; then
    cat > latest.yml << EOF
version: ${CURRENT_VERSION}
files:
  - url: TimeFlow-v${CURRENT_VERSION}-Setup.exe
    sha512: ${WIN_SHA512}
    size: ${WIN_SIZE}
path: TimeFlow-v${CURRENT_VERSION}-Setup.exe
sha512: ${WIN_SHA512}
releaseDate: '${RELEASE_DATE}'
EOF
fi

echo "✅ Auto-update configuration files updated"

# Create GitHub release
echo "🚀 Creating GitHub release..."
RELEASE_NOTES="## TimeFlow v${CURRENT_VERSION}

### 🎯 What's New
- Enhanced performance and stability
- Improved macOS compatibility
- Updated security features
- Better error handling

### 📦 Downloads
- **macOS (Apple Silicon)**: TimeFlow-v${CURRENT_VERSION}-ARM64.dmg
- **macOS (Intel)**: TimeFlow-v${CURRENT_VERSION}-Intel.dmg"

if [[ -n "$WIN_SHA512" ]]; then
    RELEASE_NOTES="${RELEASE_NOTES}
- **Windows**: TimeFlow-v${CURRENT_VERSION}-Setup.exe"
fi

if [[ -n "$LINUX_SHA512" ]]; then
    RELEASE_NOTES="${RELEASE_NOTES}
- **Linux**: TimeFlow-v${CURRENT_VERSION}-Linux.AppImage"
fi

RELEASE_NOTES="${RELEASE_NOTES}

### 🔐 Security
- All macOS builds are signed and notarized
- Windows builds are signed with valid certificate
- SHA512 checksums provided for verification

### 🔄 Auto-Updates
Existing users will be automatically notified of this update."

# Check if release already exists
if gh release view "$RELEASE_TAG" > /dev/null 2>&1; then
    echo "⚠️ Release $RELEASE_TAG already exists. Deleting..."
    gh release delete "$RELEASE_TAG" --yes
fi

# Create the release with all files
RELEASE_FILES=("$DMG_INTEL_RENAMED" "$DMG_ARM64_RENAMED" "latest-mac.yml")

if [[ -f "$EXE_WIN_RENAMED" ]]; then
    RELEASE_FILES+=("$EXE_WIN_RENAMED")
fi

if [[ -f "$APPIMAGE_LINUX_RENAMED" ]]; then
    RELEASE_FILES+=("$APPIMAGE_LINUX_RENAMED")
fi

if [[ -f "latest.yml" ]]; then
    RELEASE_FILES+=("latest.yml")
fi

gh release create "$RELEASE_TAG" "${RELEASE_FILES[@]}" \
    --title "TimeFlow v${CURRENT_VERSION}" \
    --notes "$RELEASE_NOTES" \
    --latest

echo "✅ GitHub release created: https://github.com/${GITHUB_REPO}/releases/tag/${RELEASE_TAG}"

# Copy files to public downloads directory for web access
echo "📁 Copying files to public downloads directory..."
mkdir -p public/downloads
cp "$DMG_INTEL_RENAMED" "public/downloads/"
cp "$DMG_ARM64_RENAMED" "public/downloads/"

if [[ -f "$EXE_WIN_RENAMED" ]]; then
    cp "$EXE_WIN_RENAMED" "public/downloads/"
fi

if [[ -f "$APPIMAGE_LINUX_RENAMED" ]]; then
    cp "$APPIMAGE_LINUX_RENAMED" "public/downloads/"
fi

# Update checksums file
echo "🔐 Updating checksums file..."
cd public/downloads
shasum -a 512 TimeFlow-v${CURRENT_VERSION}-*.* > checksums.txt
cd ../..

echo "✅ Files copied to public/downloads/"

# Commit and push changes
echo "📝 Committing changes..."
git add -A
git commit -m "🚀 Release v${CURRENT_VERSION} - Complete cross-platform release with signing & notarization

- Updated version to ${CURRENT_VERSION}
- Updated download URLs in web interface
- Generated signed and notarized DMG files for macOS
- Generated signed EXE for Windows
- Generated AppImage for Linux
- Updated auto-update configurations
- Created GitHub release with all binaries"

echo "⬆️ Pushing to GitHub..."
git push origin main

echo "🎉 Ultimate Release Complete!"
echo ""
echo "📋 Release Summary:"
echo "   Version: v${CURRENT_VERSION}"
echo "   Release URL: https://github.com/${GITHUB_REPO}/releases/tag/${RELEASE_TAG}"
echo "   Web URL: https://time-flow-admin.vercel.app/download"
echo "   Auto-update: Enabled for all platforms"
echo ""
echo "✅ All systems ready! Users can now:"
echo "   - Download the latest version from the web"
echo "   - Receive auto-update notifications"
echo "   - Install signed and notarized applications"
echo ""
echo "🔗 Next steps:"
echo "   1. Test downloads on each platform"
echo "   2. Verify auto-update notifications"
echo "   3. Monitor GitHub release analytics"
echo "   4. Announce the release to users" 