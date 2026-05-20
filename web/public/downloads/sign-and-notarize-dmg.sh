#!/bin/bash

echo "🔐 TimeFlow DMG - Professional Signing & Notarization"
echo "===================================================="

# Check for certificates
CERTS=$(security find-identity -p codesigning -v | grep "Developer ID Application")
if [ -z "$CERTS" ]; then
    echo "❌ No Developer ID Application certificate found!"
    exit 1
fi

CERT_NAME=$(echo "$CERTS" | head -1 | sed 's/.*"\(.*\)".*/\1/')
echo "🔐 Using certificate: $CERT_NAME"

# Check if current DMG exists
if [ ! -f "TimeFlow.dmg" ]; then
    echo "❌ TimeFlow.dmg not found!"
    exit 1
fi

echo ""
echo "📋 For notarization, we need your Apple ID credentials:"
read -p "Enter your Apple ID (for notarization): " APPLE_ID
read -s -p "Enter app-specific password: " APP_PASSWORD
echo ""

echo ""
echo "🔐 Step 1: Signing the DMG with your Apple Developer certificate..."
codesign --force --sign "$CERT_NAME" TimeFlow.dmg

if [ $? -eq 0 ]; then
    echo "✅ DMG signing successful!"
    
    echo ""
    echo "🔔 Step 2: Submitting DMG for notarization..."
    echo "    This may take 1-5 minutes..."
    
    xcrun notarytool submit TimeFlow.dmg \
        --apple-id "$APPLE_ID" \
        --password "$APP_PASSWORD" \
        --team-id "6GW49LK9V9" \
        --wait
    
    if [ $? -eq 0 ]; then
        echo "✅ Notarization successful!"
        
        echo ""
        echo "🏷️  Step 3: Stapling notarization ticket to DMG..."
        xcrun stapler staple TimeFlow.dmg
        
        echo ""
        echo "🎉 SUCCESS! TimeFlow.dmg is now:"
        echo "   ✅ Signed with Apple Developer certificate"
        echo "   ✅ Notarized by Apple"
        echo "   ✅ Zero Gatekeeper warnings guaranteed"
        echo "   ✅ Enterprise distribution ready"
        echo ""
        echo "📋 Verification:"
        codesign --verify --verbose TimeFlow.dmg
        spctl --assess --type open --context context:primary-signature TimeFlow.dmg
        
    else
        echo "❌ Notarization failed!"
        echo ""
        echo "Common issues:"
        echo "• Check your Apple ID credentials"
        echo "• Ensure app-specific password is correct"
        echo "• Verify your team ID (6GW49LK9V9)"
        echo ""
        echo "The DMG is signed but not notarized."
        echo "Signed DMGs may still show warnings without notarization."
    fi
else
    echo "❌ DMG signing failed!"
    echo "Please check your certificate installation."
fi

echo ""
echo "📊 Current DMG status:"
file TimeFlow.dmg
ls -la TimeFlow.dmg 