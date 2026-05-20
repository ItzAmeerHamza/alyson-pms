#!/bin/bash

# TimeFlow App Signing Script
# Run this after getting Apple Developer certificate

APP_PATH="temp_dmg/TimeFlow Installer.app"
DEVELOPER_ID="Developer ID Application: Your Name (TEAM_ID)"

echo "🔐 Code Signing TimeFlow Desktop Installer..."

# Check if certificate exists
if ! security find-identity -p codesigning -v | grep -q "Developer ID Application"; then
    echo "❌ No Developer ID Application certificate found!"
    echo ""
    echo "To get a certificate:"
    echo "1. Join Apple Developer Program ($99/year)"
    echo "2. Create certificates in developer.apple.com"
    echo "3. Download and install the certificate"
    echo ""
    exit 1
fi

# Sign the app
echo "Signing app bundle..."
codesign --force --options runtime --deep --sign "$DEVELOPER_ID" "$APP_PATH"

# Verify signature
echo "Verifying signature..."
codesign --verify --verbose "$APP_PATH"

if [ $? -eq 0 ]; then
    echo "✅ App signed successfully!"
    echo "Creating signed DMG..."
    
    # Create signed DMG
    rm -f TimeFlow-Signed.dmg
    hdiutil create -volname "TimeFlow Desktop Installer" -srcfolder temp_dmg -ov -format UDZO TimeFlow-Signed.dmg
    
    # Sign the DMG
    codesign --force --sign "$DEVELOPER_ID" TimeFlow-Signed.dmg
    
    echo "✅ Signed DMG created: TimeFlow-Signed.dmg"
else
    echo "❌ Signing failed!"
    exit 1
fi 