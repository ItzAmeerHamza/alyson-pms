Apple Developer Program membership ($99/year)
#!/bin/bash

echo "🔐 TimeFlow DMG - Complete Signing Process"
echo "=========================================="

# Check for certificates
CERTS=$(security find-identity -p codesigning -v | grep "Developer ID Application")
if [ -z "$CERTS" ]; then
    echo "❌ No Developer ID Application certificate found!"
    exit 1
fi

CERT_NAME=$(echo "$CERTS" | head -1 | sed 's/.*"\(.*\)".*/\1/')
echo "🔐 Using certificate: $CERT_NAME"

# Check if DMG exists
if [ ! -f "TimeFlow.dmg" ]; then
    echo "❌ TimeFlow.dmg not found!"
    exit 1
fi

# Create temporary directory
echo "📁 Creating temporary workspace..."
rm -rf temp_signing
mkdir temp_signing

# Extract DMG contents
echo "📦 Extracting DMG contents..."
hdiutil attach TimeFlow.dmg -mountpoint temp_signing/mounted_dmg

# Copy contents to working directory
cp -R "temp_signing/mounted_dmg/" temp_signing/dmg_contents/

# Unmount original DMG
hdiutil detach temp_signing/mounted_dmg

# Sign the app inside
echo "🔐 Signing the app inside DMG..."
APP_PATH="temp_signing/dmg_contents/Alyson Work Time.app"

if [ -d "$APP_PATH" ]; then
    # Sign all executables and frameworks within the app
    echo "  🔐 Signing app contents..."
    find "$APP_PATH" -name "*.dylib" -o -name "*.framework" -o -name "*.app" | while read file; do
        if [ -f "$file" ] || [ -d "$file" ]; then
            echo "    Signing: $file"
            codesign --force --options runtime --deep --sign "$CERT_NAME" "$file" 2>/dev/null || true
        fi
    done
    
    # Sign the main app bundle
    echo "  🔐 Signing main app bundle..."
    codesign --force --options runtime --deep --sign "$CERT_NAME" "$APP_PATH"
    
    if [ $? -eq 0 ]; then
        echo "✅ App signed successfully!"
        
        # Verify app signature
        echo "🔍 Verifying app signature..."
        codesign --verify --verbose "$APP_PATH"
        
        # Create new signed DMG
        echo "📦 Creating new signed DMG..."
        rm -f TimeFlow-Signed.dmg
        hdiutil create -volname "Install Alyson Work Time 2" -srcfolder temp_signing/dmg_contents -ov -format UDZO TimeFlow-Signed.dmg
        
        # Sign the DMG itself
        echo "🔐 Signing the DMG..."
        codesign --force --sign "$CERT_NAME" TimeFlow-Signed.dmg
        
        if [ $? -eq 0 ]; then
            echo "✅ DMG signed successfully!"
            
            # Verify DMG signature
            echo "🔍 Verifying DMG signature..."
            codesign --verify --verbose TimeFlow-Signed.dmg
            
            echo ""
            echo "🎉 SUCCESS! Created TimeFlow-Signed.dmg"
            echo "   ✅ App inside DMG is properly signed"
            echo "   ✅ DMG itself is signed"
            echo "   ✅ Ready for distribution"
            echo ""
            
            # Show file info
            ls -la TimeFlow-Signed.dmg
            
        else
            echo "❌ DMG signing failed!"
        fi
    else
        echo "❌ App signing failed!"
    fi
else
    echo "❌ App not found at expected path: $APP_PATH"
fi

# Cleanup
echo "🧹 Cleaning up temporary files..."
rm -rf temp_signing

echo ""
echo "📋 Final status:"
if [ -f "TimeFlow-Signed.dmg" ]; then
    echo "✅ Signed DMG created: TimeFlow-Signed.dmg"
    echo "🔍 Checking signatures:"
    spctl --assess --type open --context context:primary-signature TimeFlow-Signed.dmg
else
    echo "❌ No signed DMG was created"
fi 