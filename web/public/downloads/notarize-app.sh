#!/bin/bash

echo "🍎 Apple Notarization Script for TimeFlow"
echo "========================================="

# Configuration
APP_PATH="$1"
BUNDLE_ID="com.ebdaadt.timetracker"
APPLE_ID="your-apple-id@email.com"  # Replace with your Apple ID
APP_PASSWORD="your-app-specific-password"  # Replace with app-specific password
TEAM_ID="6GW49LK9V9"

if [ -z "$APP_PATH" ]; then
    echo "❌ Usage: $0 <path-to-app>"
    echo "   Example: $0 'Alyson Work Time.app'"
    exit 1
fi

if [ ! -d "$APP_PATH" ]; then
    echo "❌ App not found: $APP_PATH"
    exit 1
fi

echo "📱 App: $APP_PATH"
echo "🆔 Bundle ID: $BUNDLE_ID"
echo "👤 Team ID: $TEAM_ID"

# Step 1: Create ZIP for notarization
echo ""
echo "📦 Creating ZIP for notarization..."
ZIP_NAME="$(basename "$APP_PATH" .app)-notarization.zip"
ditto -c -k --keepParent "$APP_PATH" "$ZIP_NAME"

if [ $? -eq 0 ]; then
    echo "✅ ZIP created: $ZIP_NAME"
else
    echo "❌ Failed to create ZIP"
    exit 1
fi

# Step 2: Submit for notarization
echo ""
echo "🚀 Submitting for notarization..."
echo "   This may take several minutes..."

xcrun notarytool submit "$ZIP_NAME" \
    --apple-id "$APPLE_ID" \
    --password "$APP_PASSWORD" \
    --team-id "$TEAM_ID" \
    --wait

if [ $? -eq 0 ]; then
    echo "✅ Notarization successful!"
    
    # Step 3: Staple the ticket
    echo ""
    echo "📎 Stapling notarization ticket..."
    xcrun stapler staple "$APP_PATH"
    
    if [ $? -eq 0 ]; then
        echo "✅ Stapling successful!"
        echo ""
        echo "🎉 App is now notarized and ready for distribution!"
        echo "   Users will not see Gatekeeper warnings."
        
        # Verify
        echo ""
        echo "🔍 Verifying notarization..."
        xcrun stapler validate "$APP_PATH"
        spctl --assess --type exec "$APP_PATH"
        
    else
        echo "❌ Stapling failed"
    fi
    
else
    echo "❌ Notarization failed"
    echo "💡 Make sure you have:"
    echo "   1. Valid Apple Developer account"
    echo "   2. Correct Apple ID and app-specific password"
    echo "   3. App is properly signed with Developer ID"
fi

# Cleanup
echo ""
echo "🧹 Cleaning up..."
rm -f "$ZIP_NAME"

echo ""
echo "📋 Next steps:"
echo "   1. If successful, create new DMG with notarized app"
echo "   2. Sign the DMG"
echo "   3. Test on fresh Mac to verify no warnings"
echo "   4. Upload to GitHub releases" 