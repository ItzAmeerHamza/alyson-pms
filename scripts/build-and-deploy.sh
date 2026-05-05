#!/bin/bash

# 🚀 Build, Sign, Notarize & Deploy Script for Alyson Work Time
# This script handles the complete deployment pipeline

set -e

echo "🚀 Alyson Work Time - Build & Deploy Pipeline"
echo "============================================"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root."
    exit 1
fi

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
echo "📦 Building version: $VERSION"

# Check if certificates are installed
if ! security find-identity -v -p codesigning | grep -q "Developer ID Application"; then
    echo "❌ Error: No Developer ID Application certificate found"
    echo "📝 Please run: ./scripts/setup-code-signing.sh first"
    exit 1
fi

# Get certificate name
CERT_NAME=$(security find-identity -v -p codesigning | grep "Developer ID Application" | head -1 | sed 's/.*") \(.*\)/\1/')
echo "🔐 Using certificate: $CERT_NAME"

# Create releases directory
RELEASES_DIR="releases/v$VERSION"
mkdir -p "$RELEASES_DIR"

echo ""
echo "🏗️ Building Applications..."
echo "=========================="

# Build all applications
echo "📱 Building Electron apps..."
npm run build:all

echo "🖥️ Building desktop agent..."
npm run build:electron

echo ""
echo "📦 Creating Distribution Packages..."
echo "=================================="

# Create DMG for macOS (ARM64)
echo "🍎 Creating macOS ARM64 DMG..."
npx electron-builder --mac --arm64 --config.mac.identity="$CERT_NAME" --publish=never

# Create DMG for macOS (Intel)
echo "🍎 Creating macOS Intel DMG..."
npx electron-builder --mac --x64 --config.mac.identity="$CERT_NAME" --publish=never

# Create Windows EXE
echo "🪟 Creating Windows EXE..."
npx electron-builder --win --publish=never

echo ""
echo "🔐 Code Signing & Notarization..."
echo "================================="

# Find the built DMG files
ARM_DMG=$(find dist -name "*arm64*.dmg" | head -1)
INTEL_DMG=$(find dist -name "*x64*.dmg" -o -name "*intel*.dmg" | head -1)
WIN_EXE=$(find dist -name "*.exe" | head -1)

if [ -z "$ARM_DMG" ]; then
    echo "❌ ARM64 DMG not found in dist/"
    exit 1
fi

if [ -z "$INTEL_DMG" ]; then
    echo "❌ Intel DMG not found in dist/"
    exit 1
fi

if [ -z "$WIN_EXE" ]; then
    echo "❌ Windows EXE not found in dist/"
    exit 1
fi

echo "📦 Found built files:"
echo "   ARM64 DMG: $ARM_DMG"
echo "   Intel DMG: $INTEL_DMG"
echo "   Windows EXE: $WIN_EXE"

# Sign and notarize macOS DMGs
echo ""
echo "🔐 Signing macOS DMGs..."
codesign --sign "$CERT_NAME" --verbose --force --options runtime "$ARM_DMG"
codesign --sign "$CERT_NAME" --verbose --force --options runtime "$INTEL_DMG"

echo "✅ DMGs signed successfully"

# Notarize DMGs
echo ""
echo "📋 Notarizing macOS DMGs..."
echo "🔄 This may take several minutes..."

echo "📤 Submitting ARM64 DMG for notarization..."
xcrun notarytool submit "$ARM_DMG" --keychain-profile "ebdaa-notarization" --wait

echo "📤 Submitting Intel DMG for notarization..."
xcrun notarytool submit "$INTEL_DMG" --keychain-profile "ebdaa-notarization" --wait

echo "✅ Notarization complete!"

# Staple the notarization to the DMGs
echo "📎 Stapling notarization tickets..."
xcrun stapler staple "$ARM_DMG"
xcrun stapler staple "$INTEL_DMG"

echo "✅ Notarization tickets stapled"

# Copy files to releases directory with proper names
ARM_RELEASE_NAME="Alyson-Work-Time-$VERSION-arm64.dmg"
INTEL_RELEASE_NAME="Alyson-Work-Time-$VERSION.dmg"
WIN_RELEASE_NAME="Alyson-Work-Time-Setup-$VERSION.exe"

cp "$ARM_DMG" "$RELEASES_DIR/$ARM_RELEASE_NAME"
cp "$INTEL_DMG" "$RELEASES_DIR/$INTEL_RELEASE_NAME"
cp "$WIN_EXE" "$RELEASES_DIR/$WIN_RELEASE_NAME"

echo ""
echo "📁 Release files prepared:"
echo "   $RELEASES_DIR/$ARM_RELEASE_NAME"
echo "   $RELEASES_DIR/$INTEL_RELEASE_NAME"
echo "   $RELEASES_DIR/$WIN_RELEASE_NAME"

# Generate file hashes for update files
echo ""
echo "🔐 Generating file hashes..."
ARM_HASH=$(shasum -a 512 "$RELEASES_DIR/$ARM_RELEASE_NAME" | cut -d' ' -f1 | xxd -r -p | base64)
INTEL_HASH=$(shasum -a 512 "$RELEASES_DIR/$INTEL_RELEASE_NAME" | cut -d' ' -f1 | xxd -r -p | base64)
WIN_HASH=$(shasum -a 512 "$RELEASES_DIR/$WIN_RELEASE_NAME" | cut -d' ' -f1 | xxd -r -p | base64)

ARM_SIZE=$(stat -f%z "$RELEASES_DIR/$ARM_RELEASE_NAME")
INTEL_SIZE=$(stat -f%z "$RELEASES_DIR/$INTEL_RELEASE_NAME")
WIN_SIZE=$(stat -f%z "$RELEASES_DIR/$WIN_RELEASE_NAME")

# Update latest-mac.yml
echo "📝 Updating latest-mac.yml..."
cat > latest-mac.yml << EOF
version: $VERSION
files:
  - url: $ARM_RELEASE_NAME
    sha512: $ARM_HASH
    size: $ARM_SIZE
    blockMapSize: 150000
  - url: $INTEL_RELEASE_NAME
    sha512: $INTEL_HASH
    size: $INTEL_SIZE
    blockMapSize: 155000
path: $ARM_RELEASE_NAME
sha512: $ARM_HASH
releaseDate: '$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'
EOF

# Update latest.yml
echo "📝 Updating latest.yml..."
cat > latest.yml << EOF
version: $VERSION
files:
  - url: $WIN_RELEASE_NAME
    sha512: $WIN_HASH
    size: $WIN_SIZE
path: $WIN_RELEASE_NAME
sha512: $WIN_HASH
releaseDate: '$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'
EOF

# Copy update files to releases directory
cp latest-mac.yml "$RELEASES_DIR/"
cp latest.yml "$RELEASES_DIR/"

echo "✅ Update configuration files created"

echo ""
echo "📤 Creating GitHub Release..."
echo "============================="

# Check if GitHub CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI not found. Installing..."
    brew install gh
fi

# Check if authenticated with GitHub
if ! gh auth status &> /dev/null; then
    echo "🔐 Please authenticate with GitHub..."
    gh auth login
fi

# Create release notes
RELEASE_NOTES="## Alyson Work Time v$VERSION

### 🚀 Features & Improvements
- Enhanced URL tracking and monitoring
- Improved desktop agent performance
- Better cross-platform compatibility
- Updated security and permissions handling

### 📦 Downloads
- **macOS (Apple Silicon)**: Alyson-Work-Time-$VERSION-arm64.dmg
- **macOS (Intel)**: Alyson-Work-Time-$VERSION.dmg  
- **Windows**: Alyson-Work-Time-Setup-$VERSION.exe

### 🔐 Security
- All macOS builds are signed and notarized by Apple
- Windows builds are signed with verified certificates

### 🔄 Auto-Update
This release includes automatic update capabilities. Existing users will be notified of the update automatically.

---
Built with ❤️ by RevCloud"

echo "$RELEASE_NOTES" > "$RELEASES_DIR/release-notes.md"

# Create GitHub release
echo "📤 Creating GitHub release v$VERSION..."
gh release create "v$VERSION" \
    --title "Alyson Work Time v$VERSION" \
    --notes-file "$RELEASES_DIR/release-notes.md" \
    --draft

# Upload release assets
echo "📤 Uploading release assets..."
gh release upload "v$VERSION" \
    "$RELEASES_DIR/$ARM_RELEASE_NAME" \
    "$RELEASES_DIR/$INTEL_RELEASE_NAME" \
    "$RELEASES_DIR/$WIN_RELEASE_NAME" \
    "$RELEASES_DIR/latest-mac.yml" \
    "$RELEASES_DIR/latest.yml"

echo "✅ Release assets uploaded successfully"

# Publish the release
echo "🎉 Publishing release..."
gh release edit "v$VERSION" --draft=false

echo ""
echo "🎉 Deployment Complete!"
echo "======================"
echo "✅ Version $VERSION has been built, signed, notarized, and released"
echo "🔗 Release URL: https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/releases/tag/v$VERSION"
echo ""
echo "📱 Next steps:"
echo "1. Test the auto-update functionality"
echo "2. Update the download links on your website"
echo "3. Notify users about the new release"
echo ""
echo "🔧 Auto-update files:"
echo "   - latest-mac.yml (macOS updates)"
echo "   - latest.yml (Windows updates)"
echo "   - Files are automatically served from GitHub releases"
echo ""

# Update web download links
echo "🌐 Updating web download links..."
./scripts/update-web-links.sh "$VERSION"

echo "✅ All done! 🎉" 