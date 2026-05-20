#!/bin/bash

echo "🔄 Creating Fresh DMG Files From Scratch"
echo "========================================"

CERT_NAME="Developer ID Application: RevCloud (6GW49LK9V9)"

# Clean up any previous attempts
rm -rf fresh_dmg_build
mkdir fresh_dmg_build

# Extract the app from one of the existing DMGs
echo "📦 Extracting original app..."
hdiutil attach TimeFlow.dmg -mountpoint fresh_dmg_build/extract -nobrowse -quiet

# Copy the app to our build directory
echo "📋 Copying app for fresh build..."
cp -R "fresh_dmg_build/extract/Alyson Work Time.app" fresh_dmg_build/

# Get other DMG contents
cp -R "fresh_dmg_build/extract/Applications" fresh_dmg_build/ 2>/dev/null || true
cp "fresh_dmg_build/extract/.DS_Store" fresh_dmg_build/ 2>/dev/null || true
cp "fresh_dmg_build/extract/.VolumeIcon.icns" fresh_dmg_build/ 2>/dev/null || true

# Unmount the source
hdiutil detach fresh_dmg_build/extract -quiet

# Function to create a fresh DMG
create_fresh_dmg() {
    local dmg_name=$1
    local volume_name=$2
    
    echo ""
    echo "🏗️  Creating fresh $dmg_name..."
    
    # Create the DMG structure
    local dmg_dir="fresh_dmg_build/${dmg_name}_contents"
    rm -rf "$dmg_dir"
    mkdir -p "$dmg_dir"
    
    # Copy the app
    cp -R "fresh_dmg_build/Alyson Work Time.app" "$dmg_dir/"
    
    # Create Applications symlink
    ln -s /Applications "$dmg_dir/Applications"
    
    # Add volume icon if available
    if [ -f "fresh_dmg_build/.VolumeIcon.icns" ]; then
        cp "fresh_dmg_build/.VolumeIcon.icns" "$dmg_dir/"
    fi
    
    # Sign the app first
    echo "  🔐 Signing app inside DMG..."
    find "$dmg_dir/Alyson Work Time.app" -name "*.dylib" -o -name "*.framework" -o -name "*.app" | while read file; do
        if [ -f "$file" ] || [ -d "$file" ]; then
            codesign --force --options runtime --deep --sign "$CERT_NAME" "$file" 2>/dev/null || true
        fi
    done
    
    # Sign the main app bundle
    codesign --force --options runtime --deep --sign "$CERT_NAME" "$dmg_dir/Alyson Work Time.app"
    
    # Verify app signature
    if ! codesign --verify --verbose "$dmg_dir/Alyson Work Time.app" >/dev/null 2>&1; then
        echo "  ❌ App signing failed!"
        return 1
    fi
    echo "  ✅ App signed successfully"
    
    # Create the DMG with specific settings to avoid corruption
    echo "  📦 Creating DMG with optimal settings..."
    rm -f "${dmg_name}"
    
    # Use specific hdiutil options to prevent corruption
    hdiutil create -volname "$volume_name" \
        -srcfolder "$dmg_dir" \
        -ov \
        -format UDZO \
        -imagekey zlib-level=6 \
        -fs HFS+ \
        -fsargs "-c c=64,a=16,e=16" \
        "${dmg_name}"
    
    if [ ! -f "${dmg_name}" ]; then
        echo "  ❌ DMG creation failed!"
        return 1
    fi
    
    # Sign the DMG
    echo "  🔐 Signing DMG..."
    codesign --force --sign "$CERT_NAME" "${dmg_name}"
    
    # Verify DMG
    echo "  🔍 Verifying fresh DMG..."
    if hdiutil verify "${dmg_name}" >/dev/null 2>&1 && codesign --verify "${dmg_name}" >/dev/null 2>&1; then
        echo "  ✅ Fresh DMG created and verified: ${dmg_name}"
        
        # Show file info
        local size=$(ls -lh "${dmg_name}" | awk '{print $5}')
        echo "  📏 Size: $size"
        
        # Test mount
        local test_mount="fresh_dmg_build/test_$$"
        mkdir -p "$test_mount"
        if hdiutil attach "${dmg_name}" -mountpoint "$test_mount" -nobrowse -quiet >/dev/null 2>&1; then
            echo "  ✅ Mount test: SUCCESS"
            hdiutil detach "$test_mount" -quiet >/dev/null 2>&1
        else
            echo "  ❌ Mount test: FAILED"
            return 1
        fi
        rmdir "$test_mount"
        
        return 0
    else
        echo "  ❌ DMG verification failed!"
        return 1
    fi
}

# Create fresh DMGs
echo ""
echo "🏭 Building fresh DMG files..."

# Create backup of existing files
echo "💾 Creating backups..."
cp TimeFlow.dmg TimeFlow-backup-$(date +%Y%m%d).dmg
cp TimeFlow-Intel.dmg TimeFlow-Intel-backup-$(date +%Y%m%d).dmg
cp TimeFlow-ARM.dmg TimeFlow-ARM-backup-$(date +%Y%m%d).dmg

# Create fresh DMGs
create_fresh_dmg "TimeFlow-Fresh.dmg" "Install Alyson Work Time 2"
create_fresh_dmg "TimeFlow-Intel-Fresh.dmg" "Install Alyson Work Time 2"
create_fresh_dmg "TimeFlow-ARM-Fresh.dmg" "Install Alyson Work Time 2"

# Replace if successful
if [ -f "TimeFlow-Fresh.dmg" ] && [ -f "TimeFlow-Intel-Fresh.dmg" ] && [ -f "TimeFlow-ARM-Fresh.dmg" ]; then
    echo ""
    echo "🔄 Replacing with fresh DMGs..."
    
    mv TimeFlow-Fresh.dmg TimeFlow.dmg
    mv TimeFlow-Intel-Fresh.dmg TimeFlow-Intel.dmg
    mv TimeFlow-ARM-Fresh.dmg TimeFlow-ARM.dmg
    
    echo ""
    echo "✅ Fresh DMGs created successfully!"
    echo ""
    echo "📊 Final verification:"
    echo "===================="
    
    for dmg in TimeFlow.dmg TimeFlow-Intel.dmg TimeFlow-ARM.dmg; do
        echo ""
        echo "📁 $dmg:"
        echo "  Size: $(ls -lh "$dmg" | awk '{print $5}')"
        echo "  Integrity: $(hdiutil verify "$dmg" >/dev/null 2>&1 && echo "✅ VALID" || echo "❌ INVALID")"
        echo "  Signature: $(codesign --verify "$dmg" >/dev/null 2>&1 && echo "✅ VALID" || echo "❌ INVALID")"
        
        # Generate new checksum
        local checksum=$(shasum -a 256 "$dmg" | cut -d' ' -f1)
        echo "  SHA256: $checksum"
    done
    
else
    echo ""
    echo "❌ Fresh DMG creation failed"
    echo "Restoring backups..."
    mv TimeFlow-backup-$(date +%Y%m%d).dmg TimeFlow.dmg 2>/dev/null || true
    mv TimeFlow-Intel-backup-$(date +%Y%m%d).dmg TimeFlow-Intel.dmg 2>/dev/null || true
    mv TimeFlow-ARM-backup-$(date +%Y%m%d).dmg TimeFlow-ARM.dmg 2>/dev/null || true
fi

# Cleanup
echo ""
echo "🧹 Cleaning up build directory..."
rm -rf fresh_dmg_build

echo ""
echo "🎉 Fresh DMG creation process completed!" 