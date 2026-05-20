#!/bin/bash

echo "🔧 Fixing Bundle ID and Re-signing TimeFlow App"
echo "=============================================="

CERT_NAME="Developer ID Application: RevCloud (6GW49LK9V9)"
BUNDLE_ID="com.ebdaadt.timetracker"

# Clean up any previous attempts
rm -rf fix_bundle_build
mkdir fix_bundle_build

echo "📦 Extracting app from DMG..."
hdiutil attach TimeFlow.dmg -mountpoint fix_bundle_build/source -nobrowse -quiet

# Copy the app for modification
echo "📋 Copying app for bundle fix..."
cp -R "fix_bundle_build/source/Alyson Work Time.app" fix_bundle_build/
cp -R "fix_bundle_build/source/Applications" fix_bundle_build/ 2>/dev/null || true
cp "fix_bundle_build/source/.VolumeIcon.icns" fix_bundle_build/ 2>/dev/null || true

# Unmount source
hdiutil detach fix_bundle_build/source -quiet

# Verify and fix bundle identifier
echo "🔍 Verifying bundle identifier..."
CURRENT_BUNDLE_ID=$(plutil -extract CFBundleIdentifier raw "fix_bundle_build/Alyson Work Time.app/Contents/Info.plist")
echo "Current bundle ID: $CURRENT_BUNDLE_ID"

if [ "$CURRENT_BUNDLE_ID" != "$BUNDLE_ID" ]; then
    echo "⚠️  Fixing bundle identifier to $BUNDLE_ID..."
    plutil -replace CFBundleIdentifier -string "$BUNDLE_ID" "fix_bundle_build/Alyson Work Time.app/Contents/Info.plist"
else
    echo "✅ Bundle identifier is correct: $BUNDLE_ID"
fi

# Remove any existing signatures first
echo "🧹 Removing existing signatures..."
codesign --remove-signature "fix_bundle_build/Alyson Work Time.app" 2>/dev/null || true

# Find and remove signatures from all nested components
find "fix_bundle_build/Alyson Work Time.app" -name "*.dylib" -o -name "*.framework" -o -name "*.app" | while read file; do
    if [ -f "$file" ] || [ -d "$file" ]; then
        codesign --remove-signature "$file" 2>/dev/null || true
    fi
done

echo "🔐 Re-signing with correct bundle identifier..."

# Sign all nested components first (inside to outside)
echo "  🔐 Signing frameworks and libraries..."
find "fix_bundle_build/Alyson Work Time.app" -name "*.dylib" -exec codesign --force --options runtime --sign "$CERT_NAME" {} \; 2>/dev/null || true
find "fix_bundle_build/Alyson Work Time.app" -name "*.framework" -exec codesign --force --options runtime --sign "$CERT_NAME" {} \; 2>/dev/null || true

# Sign helper apps
echo "  🔐 Signing helper applications..."
find "fix_bundle_build/Alyson Work Time.app/Contents/Frameworks" -name "*.app" -exec codesign --force --options runtime --deep --sign "$CERT_NAME" {} \; 2>/dev/null || true

# Sign the main app with specific entitlements if needed
echo "  🔐 Signing main application..."
codesign --force --options runtime --deep --sign "$CERT_NAME" --identifier "$BUNDLE_ID" "fix_bundle_build/Alyson Work Time.app"

# Verify the signature
echo "🔍 Verifying app signature..."
if codesign --verify --verbose "fix_bundle_build/Alyson Work Time.app"; then
    echo "✅ App signature verified successfully"
else
    echo "❌ App signature verification failed"
    exit 1
fi

# Check bundle ID is correct after signing
FINAL_BUNDLE_ID=$(plutil -extract CFBundleIdentifier raw "fix_bundle_build/Alyson Work Time.app/Contents/Info.plist")
echo "✅ Final bundle ID: $FINAL_BUNDLE_ID"

# Function to create properly signed DMG
create_signed_dmg() {
    local dmg_name=$1
    local volume_name=$2
    
    echo ""
    echo "📦 Creating $dmg_name..."
    
    # Create DMG structure
    local dmg_dir="fix_bundle_build/${dmg_name}_contents"
    rm -rf "$dmg_dir"
    mkdir -p "$dmg_dir"
    
    # Copy signed app
    cp -R "fix_bundle_build/Alyson Work Time.app" "$dmg_dir/"
    
    # Create Applications symlink
    ln -s /Applications "$dmg_dir/Applications"
    
    # Add volume icon
    if [ -f "fix_bundle_build/.VolumeIcon.icns" ]; then
        cp "fix_bundle_build/.VolumeIcon.icns" "$dmg_dir/"
    fi
    
    # Create DMG with settings to prevent corruption
    rm -f "${dmg_name}"
    hdiutil create -volname "$volume_name" \
        -srcfolder "$dmg_dir" \
        -ov \
        -format UDZO \
        -imagekey zlib-level=6 \
        -fs HFS+ \
        -fsargs "-c c=64,a=16,e=16" \
        -quiet \
        "${dmg_name}"
    
    if [ ! -f "${dmg_name}" ]; then
        echo "❌ Failed to create $dmg_name"
        return 1
    fi
    
    # Sign the DMG
    echo "  🔐 Signing $dmg_name..."
    codesign --force --sign "$CERT_NAME" "${dmg_name}"
    
    # Verify DMG
    if hdiutil verify "${dmg_name}" >/dev/null 2>&1 && codesign --verify "${dmg_name}" >/dev/null 2>&1; then
        echo "  ✅ $dmg_name created and signed successfully"
        echo "  📏 Size: $(ls -lh "${dmg_name}" | awk '{print $5}')"
        
        # Test mount
        local test_mount="fix_bundle_build/test_$$"
        mkdir -p "$test_mount"
        if hdiutil attach "${dmg_name}" -mountpoint "$test_mount" -nobrowse -quiet >/dev/null 2>&1; then
            echo "  ✅ Mount test: SUCCESS"
            # Test app inside DMG
            if codesign --verify "$test_mount/Alyson Work Time.app" >/dev/null 2>&1; then
                echo "  ✅ App signature in DMG: VALID"
            else
                echo "  ❌ App signature in DMG: INVALID"
            fi
            hdiutil detach "$test_mount" -quiet >/dev/null 2>&1
        else
            echo "  ❌ Mount test: FAILED"
            return 1
        fi
        rmdir "$test_mount"
        
        return 0
    else
        echo "  ❌ $dmg_name verification failed"
        return 1
    fi
}

# Create backups
echo ""
echo "💾 Creating backups..."
cp TimeFlow.dmg TimeFlow-backup-bundle-$(date +%Y%m%d_%H%M).dmg
cp TimeFlow-Intel.dmg TimeFlow-Intel-backup-bundle-$(date +%Y%m%d_%H%M).dmg
cp TimeFlow-ARM.dmg TimeFlow-ARM-backup-bundle-$(date +%Y%m%d_%H%M).dmg

# Create new signed DMGs
echo ""
echo "🏭 Creating properly signed DMG files..."

create_signed_dmg "TimeFlow-Fixed.dmg" "Install Alyson Work Time 2"
create_signed_dmg "TimeFlow-Intel-Fixed.dmg" "Install Alyson Work Time 2"
create_signed_dmg "TimeFlow-ARM-Fixed.dmg" "Install Alyson Work Time 2"

# Replace originals if successful
if [ -f "TimeFlow-Fixed.dmg" ] && [ -f "TimeFlow-Intel-Fixed.dmg" ] && [ -f "TimeFlow-ARM-Fixed.dmg" ]; then
    echo ""
    echo "🔄 Replacing original DMGs with fixed versions..."
    
    mv TimeFlow-Fixed.dmg TimeFlow.dmg
    mv TimeFlow-Intel-Fixed.dmg TimeFlow-Intel.dmg
    mv TimeFlow-ARM-Fixed.dmg TimeFlow-ARM.dmg
    
    echo ""
    echo "🎉 SUCCESS! Fixed DMGs with correct bundle ID created!"
    echo ""
    echo "📊 Final verification:"
    echo "===================="
    
    for dmg in TimeFlow.dmg TimeFlow-Intel.dmg TimeFlow-ARM.dmg; do
        echo ""
        echo "📁 $dmg:"
        echo "  Size: $(ls -lh "$dmg" | awk '{print $5}')"
        echo "  DMG Signature: $(codesign --verify "$dmg" >/dev/null 2>&1 && echo "✅ VALID" || echo "❌ INVALID")"
        echo "  DMG Integrity: $(hdiutil verify "$dmg" >/dev/null 2>&1 && echo "✅ VALID" || echo "❌ INVALID")"
        
        # Generate checksum
        local checksum=$(shasum -a 256 "$dmg" | cut -d' ' -f1)
        echo "  SHA256: $checksum"
    done
    
else
    echo ""
    echo "❌ Failed to create fixed DMGs"
    echo "Restoring backups..."
    mv TimeFlow-backup-bundle-$(date +%Y%m%d_%H%M).dmg TimeFlow.dmg 2>/dev/null || true
    mv TimeFlow-Intel-backup-bundle-$(date +%Y%m%d_%H%M).dmg TimeFlow-Intel.dmg 2>/dev/null || true
    mv TimeFlow-ARM-backup-bundle-$(date +%Y%m%d_%H%M).dmg TimeFlow-ARM.dmg 2>/dev/null || true
fi

# Cleanup
echo ""
echo "🧹 Cleaning up..."
rm -rf fix_bundle_build

echo ""
echo "✅ Bundle ID fix and re-signing completed!"
echo "App bundle identifier: $BUNDLE_ID"
echo "Certificate: $CERT_NAME" 