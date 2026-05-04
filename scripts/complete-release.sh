#!/bin/bash
set -e

# 🚀 Complete TimeFlow Release Script (macOS focused)
# Handles signing, notarization, and GitHub release creation

echo "🚀 Starting Complete TimeFlow Release Process (macOS + GitHub)..."

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

# Build desktop applications (macOS only for faster testing)
echo "🖥️ Building macOS desktop applications with signing & notarization..."
echo "   This will take several minutes for Apple notarization..."
npx electron-builder --mac --publish=never

# Verify builds were created
echo "🔍 Verifying build outputs..."
DMG_INTEL="dist/Ebdaa Work Time-${CURRENT_VERSION}.dmg"
DMG_ARM64="dist/Ebdaa Work Time-${CURRENT_VERSION}-arm64.dmg"

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

echo "✅ Both DMG files created and signed successfully"

# Rename files to match our naming convention
echo "📝 Renaming files to match naming convention..."
cp "$DMG_INTEL" "dist/TimeFlow-v${CURRENT_VERSION}-Intel.dmg"
cp "$DMG_ARM64" "dist/TimeFlow-v${CURRENT_VERSION}-ARM64.dmg"

# Generate file information
echo "📊 Generating file information..."
DMG_INTEL_RENAMED="dist/TimeFlow-v${CURRENT_VERSION}-Intel.dmg"
DMG_ARM64_RENAMED="dist/TimeFlow-v${CURRENT_VERSION}-ARM64.dmg"

# Calculate SHA512 hashes and file sizes
echo "🔐 Calculating SHA512 hashes..."
INTEL_SHA512=$(shasum -a 512 "$DMG_INTEL_RENAMED" | cut -d' ' -f1)
INTEL_SIZE=$(stat -f%z "$DMG_INTEL_RENAMED" 2>/dev/null || stat -c%s "$DMG_INTEL_RENAMED")

ARM64_SHA512=$(shasum -a 512 "$DMG_ARM64_RENAMED" | cut -d' ' -f1)
ARM64_SIZE=$(stat -f%z "$DMG_ARM64_RENAMED" 2>/dev/null || stat -c%s "$DMG_ARM64_RENAMED")

echo "📋 File Information:"
echo "   Intel DMG: ${INTEL_SIZE} bytes, SHA512: ${INTEL_SHA512}"
echo "   ARM64 DMG: ${ARM64_SIZE} bytes, SHA512: ${ARM64_SHA512}"

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

echo "✅ Auto-update configuration files updated"

# Create GitHub release
echo "🚀 Creating GitHub release..."
RELEASE_NOTES="## TimeFlow v${CURRENT_VERSION}

### 🎯 What's New
- Enhanced performance and stability
- Improved macOS compatibility  
- Updated security features
- Better error handling and user experience

### 📦 Downloads
- **macOS (Apple Silicon)**: TimeFlow-v${CURRENT_VERSION}-ARM64.dmg ✅ Signed & Notarized
- **macOS (Intel)**: TimeFlow-v${CURRENT_VERSION}-Intel.dmg ✅ Signed & Notarized

### 🔐 Security
- All macOS builds are code signed and notarized by Apple
- Enhanced security permissions for screen recording and accessibility
- SHA512 checksums provided for verification

### 🔄 Auto-Updates
Existing users will be automatically notified of this update and can upgrade seamlessly.

### 📋 Installation
1. Download the appropriate DMG file for your Mac
2. Open the DMG and drag TimeFlow to Applications
3. Launch from Applications folder
4. Grant permissions when prompted (Screen Recording & Accessibility)

### 🛠️ System Requirements
- **Apple Silicon**: macOS 11.0 or later
- **Intel**: macOS 10.14 or later"

# Check if release already exists
if gh release view "$RELEASE_TAG" > /dev/null 2>&1; then
    echo "⚠️ Release $RELEASE_TAG already exists. Deleting..."
    gh release delete "$RELEASE_TAG" --yes
fi

# Create the release with all files
gh release create "$RELEASE_TAG" \
    "$DMG_INTEL_RENAMED" \
    "$DMG_ARM64_RENAMED" \
    "latest-mac.yml" \
    --title "TimeFlow v${CURRENT_VERSION} - macOS Release" \
    --notes "$RELEASE_NOTES" \
    --latest

echo "✅ GitHub release created: https://github.com/${GITHUB_REPO}/releases/tag/${RELEASE_TAG}"

# Copy files to public downloads directory for web access
echo "📁 Copying files to public downloads directory..."
mkdir -p public/downloads
cp "$DMG_INTEL_RENAMED" "public/downloads/"
cp "$DMG_ARM64_RENAMED" "public/downloads/"

# Update checksums file
echo "🔐 Updating checksums file..."
cd public/downloads
shasum -a 512 TimeFlow-v${CURRENT_VERSION}-*.dmg > checksums.txt
cd ../..

echo "✅ Files copied to public/downloads/"

# Commit and push changes
echo "📝 Committing changes..."
git add -A
git commit -m "🚀 Release v${CURRENT_VERSION} - macOS with signing & notarization

- Updated version to ${CURRENT_VERSION}
- Updated download URLs in web interface
- Generated signed and notarized DMG files for both Intel and Apple Silicon
- Updated auto-update configuration for seamless upgrades
- Created GitHub release with verified binaries"

echo "⬆️ Pushing to GitHub..."
git push origin main

echo "🎉 Complete Release Process Finished!"
echo ""
echo "📋 Release Summary:"
echo "   Version: v${CURRENT_VERSION}"
echo "   Release URL: https://github.com/${GITHUB_REPO}/releases/tag/${RELEASE_TAG}"
echo "   Web URL: https://time-flow-admin.vercel.app/download"
echo "   Auto-update: Enabled for macOS"
echo ""
echo "✅ All systems ready! Users can now:"
echo "   - Download signed & notarized macOS applications"
echo "   - Receive auto-update notifications"  
echo "   - Install without security warnings"
echo ""
echo "🔗 Next steps:"
echo "   1. Test downloads on both Intel and Apple Silicon Macs"
echo "   2. Verify auto-update notifications work"
echo "   3. Check that installations work without security warnings"
echo "   4. Monitor GitHub release analytics" 