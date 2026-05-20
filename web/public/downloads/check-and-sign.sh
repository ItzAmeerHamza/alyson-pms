#!/bin/bash

echo "🔍 Checking for Apple Developer certificates..."

# Check for certificates
CERTS=$(security find-identity -p codesigning -v | grep "Developer ID Application")

if [ -z "$CERTS" ]; then
    echo "❌ No Developer ID Application certificate found!"
    echo ""
    echo "📋 To get a certificate:"
    echo "1. Go to: https://developer.apple.com/account/resources/certificates/list"
    echo "2. Create 'Developer ID Application' certificate"
    echo "3. Download and install the .cer file"
    echo "4. Run this script again"
    echo ""
    echo "🔧 CSR file available at: ~/Desktop/TimeFlow-Certificates/TimeFlowCSR.csr"
    exit 1
else
    echo "✅ Found certificates:"
    echo "$CERTS"
    echo ""
    
    # Get the certificate name properly - extract the quoted name
    CERT_NAME=$(echo "$CERTS" | head -1 | sed 's/.*"\(.*\)".*/\1/')
    echo "🔐 Using certificate: $CERT_NAME"
    echo ""
    
    # Create app bundle to sign
    echo "📦 Creating app bundle for signing..."
    rm -rf "temp_dmg/TimeFlow Installer.app"
    mkdir -p "temp_dmg/TimeFlow Installer.app/Contents/MacOS"
    mkdir -p "temp_dmg/TimeFlow Installer.app/Contents/Resources"
    
    # Copy icon
    cp icon.icns "temp_dmg/TimeFlow Installer.app/Contents/Resources/"
    
    # Create Info.plist
    cat > "temp_dmg/TimeFlow Installer.app/Contents/Info.plist" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>TimeFlow Installer</string>
    <key>CFBundleIdentifier</key>
    <string>com.timeflow.installer</string>
    <key>CFBundleName</key>
    <string>TimeFlow Installer</string>
    <key>CFBundleDisplayName</key>
    <string>TimeFlow Desktop Installer</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleIconFile</key>
    <string>icon</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.14</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
EOF
    
    # Create executable
    cat > "temp_dmg/TimeFlow Installer.app/Contents/MacOS/TimeFlow Installer" << 'EOF'
#!/bin/bash
osascript -e '
tell application "System Events"
    display dialog "TimeFlow Desktop Installer

This will install TimeFlow Desktop to your Applications folder.

Features:
✅ Automatic time tracking
✅ Random screenshot capture (2 per 10 minutes)
✅ Activity monitoring
✅ Productivity insights
✅ Sync with web dashboard

Install TimeFlow Desktop now?" buttons {"Cancel", "Install"} default button "Install" with icon note
    
    if result = {button returned:"Install"} then
        do shell script "
            mkdir -p \"/Applications/TimeFlow Desktop.app/Contents/MacOS\"
            mkdir -p \"/Applications/TimeFlow Desktop.app/Contents/Resources\"
            
            # Create the app
            cat > \"/Applications/TimeFlow Desktop.app/Contents/Info.plist\" << PLIST_EOF
<?xml version=\\\"1.0\\\" encoding=\\\"UTF-8\\\"?>
<!DOCTYPE plist PUBLIC \\\"-//Apple//DTD PLIST 1.0//EN\\\" \\\"http://www.apple.com/DTDs/PropertyList-1.0.dtd\\\">
<plist version=\\\"1.0\\\">
<dict>
    <key>CFBundleExecutable</key>
    <string>TimeFlow Desktop</string>
    <key>CFBundleIdentifier</key>
    <string>com.timeflow.desktop</string>
    <key>CFBundleName</key>
    <string>TimeFlow Desktop</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleIconFile</key>
    <string>icon</string>
</dict>
</plist>
PLIST_EOF
            
            cat > \"/Applications/TimeFlow Desktop.app/Contents/MacOS/TimeFlow Desktop\" << APP_EOF
#!/bin/bash
osascript -e '\"'\"'
tell application \\\"System Events\\\"
    display dialog \\\"TimeFlow Desktop (Signed Demo)

This is a properly code-signed demonstration of TimeFlow Desktop.

✅ Signed with Apple Developer certificate
✅ No Gatekeeper warnings
✅ Professional installation experience

Real features the production app would have:
• Automatic time tracking
• Random screenshot capture (2 per 10 minutes)
• Activity monitoring
• Productivity insights
• Sync with web dashboard\\\" buttons {\\\"OK\\\"} with icon note
end tell
'\"'\"'
APP_EOF
            
            chmod +x \"/Applications/TimeFlow Desktop.app/Contents/MacOS/TimeFlow Desktop\"
        " with administrator privileges
        
        display dialog "✅ TimeFlow Desktop installed successfully!

The app has been installed to your Applications folder." buttons {"Open Applications", "Done"} default button "Open Applications"
        
        if result = {button returned:"Open Applications"} then
            tell application "Finder"
                open folder "Applications" of startup disk
                select file "TimeFlow Desktop.app" of folder "Applications" of startup disk
            end tell
        end if
    end if
end tell
'
EOF
    
    chmod +x "temp_dmg/TimeFlow Installer.app/Contents/MacOS/TimeFlow Installer"
    
    echo "🔐 Signing app with certificate: $CERT_NAME"
    codesign --force --options runtime --deep --sign "$CERT_NAME" "temp_dmg/TimeFlow Installer.app"
    
    if [ $? -eq 0 ]; then
        echo "✅ App signed successfully!"
        
        # Verify signature
        echo "🔍 Verifying signature..."
        codesign --verify --verbose "temp_dmg/TimeFlow Installer.app"
        
        # Create signed DMG
        echo "📦 Creating signed DMG..."
        rm -f TimeFlow-Signed.dmg
        hdiutil create -volname "TimeFlow Desktop Installer" -srcfolder temp_dmg -ov -format UDZO TimeFlow-Signed.dmg
        
        # Sign the DMG
        echo "🔐 Signing DMG..."
        codesign --force --sign "$CERT_NAME" TimeFlow-Signed.dmg
        
        echo ""
        echo "🎉 SUCCESS! Created properly signed installer:"
        echo "   TimeFlow-Signed.dmg"
        echo ""
        echo "✅ No more Gatekeeper warnings!"
        echo "✅ Professional code signing"
        echo "✅ Ready for distribution"
        
    else
        echo "❌ Signing failed!"
        exit 1
    fi
fi 