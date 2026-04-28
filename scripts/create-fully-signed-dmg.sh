#!/bin/bash

# Comprehensive macOS App Signing and Notarization Script
# Signs all components properly for Apple notarization

set -e

# Configuration
VERSION="1.0.22"
CERT_NAME="Developer ID Application: Ebdaa Digital Technology (6GW49LK9V9)"
TEAM_ID="6GW49LK9V9"
KEYCHAIN_PROFILE="timeflow-notarization"
APP_NAME="Ebdaa Work Time.app"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔐 Creating Fully Signed and Notarized DMG v${VERSION}${NC}"
echo "=============================================================="

# Check if app exists
if [[ ! -d "dist/mac-arm64/${APP_NAME}" ]]; then
    echo -e "${RED}❌ App not found. Please build first.${NC}"
    exit 1
fi

# Create entitlements files
echo -e "${YELLOW}📄 Creating entitlements...${NC}"

# Main app entitlements
cat > main-app.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.device.microphone</key>
    <true/>
    <key>com.apple.security.device.camera</key>
    <true/>
    <key>com.apple.security.automation.apple-events</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.network.server</key>
    <true/>
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
</dict>
</plist>
EOF

# Helper app entitlements
cat > helper-app.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.inherit</key>
    <true/>
</dict>
</plist>
EOF

echo -e "${YELLOW}🔏 Step 0.5: Signing Swift input helper binary...${NC}"

APP_PATH="dist/mac-arm64/${APP_NAME}"

# Sign the Swift input helper binary (requires runtime for Accessibility entitlement)
SWIFT_HELPER="$APP_PATH/Contents/Resources/helpers/macos-input-helper"
if [[ -f "$SWIFT_HELPER" ]]; then
    echo "Signing Swift helper: $SWIFT_HELPER"
    codesign --force --options runtime --entitlements helper-app.plist --sign "$CERT_NAME" --timestamp "$SWIFT_HELPER"
    echo -e "${GREEN}✅ Swift helper signed${NC}"
else
    echo -e "${YELLOW}⚠️ Swift helper not found at: $SWIFT_HELPER (skipping)${NC}"
fi

echo -e "${YELLOW}🔏 Step 1: Signing native modules and binaries...${NC}"

# Sign native modules first
find "$APP_PATH/Contents/Resources/app.asar.unpacked" -name "*.node" -exec codesign --force --options runtime --entitlements helper-app.plist --sign "$CERT_NAME" --timestamp {} \; 2>/dev/null || true
find "$APP_PATH/Contents/Resources/app.asar.unpacked" -type f -perm +111 -exec codesign --force --options runtime --entitlements helper-app.plist --sign "$CERT_NAME" --timestamp {} \; 2>/dev/null || true

echo -e "${YELLOW}🔏 Step 2: Signing Electron framework components...${NC}"

# Sign Electron framework libraries
find "$APP_PATH/Contents/Frameworks/Electron Framework.framework" -name "*.dylib" -exec codesign --force --options runtime --sign "$CERT_NAME" --timestamp {} \; 2>/dev/null || true
find "$APP_PATH/Contents/Frameworks/Electron Framework.framework" -type f -perm +111 -exec codesign --force --options runtime --sign "$CERT_NAME" --timestamp {} \; 2>/dev/null || true

# Sign framework itself
codesign --force --options runtime --sign "$CERT_NAME" --timestamp "$APP_PATH/Contents/Frameworks/Electron Framework.framework" 2>/dev/null || true

echo -e "${YELLOW}🔏 Step 3: Signing other frameworks...${NC}"

# Sign other frameworks
for framework in "$APP_PATH/Contents/Frameworks"/*.framework; do
    if [[ -d "$framework" ]]; then
        echo "Signing framework: $(basename "$framework")"
        codesign --force --options runtime --sign "$CERT_NAME" --timestamp "$framework" 2>/dev/null || true
    fi
done

echo -e "${YELLOW}🔏 Step 4: Signing helper applications...${NC}"

# Sign helper apps
find "$APP_PATH/Contents/Frameworks" -name "*.app" -exec codesign --force --options runtime --entitlements helper-app.plist --sign "$CERT_NAME" --timestamp {} \; 2>/dev/null || true

echo -e "${YELLOW}🔏 Step 5: Signing main executable...${NC}"

# Sign main executable
codesign --force --options runtime --entitlements main-app.plist --sign "$CERT_NAME" --timestamp "$APP_PATH/Contents/MacOS/Ebdaa Work Time"

echo -e "${YELLOW}🔏 Step 6: Signing main application...${NC}"

# Sign the main app bundle
codesign --force --options runtime --entitlements main-app.plist --sign "$CERT_NAME" --timestamp "$APP_PATH"

echo -e "${YELLOW}✅ Step 7: Verifying signatures...${NC}"

# Verify signatures
codesign --verify --verbose --deep "$APP_PATH"
spctl -a -t exec -vv "$APP_PATH"

echo -e "${YELLOW}📦 Step 8: Creating DMG...${NC}"

# Create DMG
DMG_NAME="Ebdaa Work Time-1.0.22-arm64-Signed.dmg"
rm -f "dist/${DMG_NAME}"

npx create-dmg "$APP_PATH" dist/ --dmg-title="Install Ebdaa Work Time" --overwrite 2>/dev/null || {
    echo "Using hdiutil to create DMG..."
    
    # Create temp directory for DMG contents
    DMG_DIR="$(mktemp -d)"
    cp -R "$APP_PATH" "$DMG_DIR/"
    ln -sf /Applications "$DMG_DIR/Applications"
    
    # Create DMG
    hdiutil create -volname "Install Ebdaa Work Time" -srcfolder "$DMG_DIR" -ov -format UDZO "dist/${DMG_NAME}"
    rm -rf "$DMG_DIR"
}

echo -e "${YELLOW}🔏 Step 9: Signing DMG...${NC}"

# Sign the DMG
codesign --force --sign "$CERT_NAME" --timestamp "dist/${DMG_NAME}"

echo -e "${YELLOW}📋 Step 10: Notarizing DMG...${NC}"

# Submit for notarization
echo "Submitting to Apple for notarization..."
xcrun notarytool submit "dist/${DMG_NAME}" \
    --keychain-profile "$KEYCHAIN_PROFILE" \
    --wait \
    --timeout 30m

echo -e "${YELLOW}🔖 Step 11: Stapling notarization...${NC}"

# Staple the ticket
xcrun stapler staple "dist/${DMG_NAME}"

echo -e "${YELLOW}✅ Step 12: Final verification...${NC}"

# Final verification
spctl -a -t open --context context:primary-signature -v "dist/${DMG_NAME}"
codesign --verify --verbose "dist/${DMG_NAME}"

# Clean up
rm -f main-app.plist helper-app.plist

echo -e "${GREEN}🎉 Successfully created signed and notarized DMG!${NC}"
echo -e "${GREEN}📁 File: dist/${DMG_NAME}${NC}"
echo -e "${GREEN}📏 Size: $(ls -lh "dist/${DMG_NAME}" | awk '{print $5}')${NC}"

echo ""
echo -e "${BLUE}✅ Ready for distribution:${NC}"
echo "  • Code signed with Developer ID certificate"
echo "  • Apple notarized and stapled"
echo "  • Gatekeeper compatible"
echo "  • No security warnings on installation" 