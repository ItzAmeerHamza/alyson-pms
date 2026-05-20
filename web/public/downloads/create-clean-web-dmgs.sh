#!/bin/bash

echo "🧹 Creating Absolutely Clean DMG Files for Web"
echo "============================================="

CERT_NAME="Developer ID Application: RevCloud (6GW49LK9V9)"

# Create clean build directory
rm -rf clean_web_build
mkdir clean_web_build

# Extract app from existing DMG
echo "📦 Extracting app from current DMG..."
hdiutil attach TimeFlow.dmg -mountpoint clean_web_build/source -nobrowse -quiet

# Copy app to clean location
echo "📋 Creating clean app copy..."
cp -R "clean_web_build/source/Alyson Work Time.app" clean_web_build/
cp -R "clean_web_build/source/Applications" clean_web_build/ 2>/dev/null || true

# Unmount source
hdiutil detach clean_web_build/source -quiet

# Remove any extended attributes from copied app
echo "🧹 Cleaning app bundle..."
find clean_web_build/ -exec xattr -c {} \; 2>/dev/null || true

# Function to create absolutely clean DMG
create_clean_dmg() {
    local output_name=$1
    local volume_name=$2
    
    echo ""
    echo "🏭 Creating clean $output_name..."
    
    # Create completely clean DMG directory
    local clean_dir="clean_web_build/${output_name}_dir"
    rm -rf "$clean_dir"
    mkdir -p "$clean_dir"
    
    # Copy signed app
    cp -R "clean_web_build/Alyson Work Time.app" "$clean_dir/"
    
    # Create Applications symlink
    ln -s /Applications "$clean_dir/Applications"
    
    # Remove all extended attributes from everything
    find "$clean_dir" -exec xattr -c {} \; 2>/dev/null || true
    
    # Create DMG in /tmp to avoid any local filesystem issues
    local temp_dmg="/tmp/${output_name}"
    rm -f "$temp_dmg"
    
    echo "  📦 Creating base DMG..."
    hdiutil create \
        -volname "$volume_name" \
        -srcfolder "$clean_dir" \
        -ov \
        -format UDZO \
        -imagekey zlib-level=9 \
        -fs HFS+ \
        -quiet \
        "$temp_dmg"
    
    # Copy back and ensure no extended attributes
    cp "$temp_dmg" "$output_name"
    rm -f "$temp_dmg"
    
    # Remove any extended attributes from the DMG file itself
    xattr -c "$output_name" 2>/dev/null || true
    
    # Sign the clean DMG
    echo "  🔐 Signing clean DMG..."
    codesign --force --sign "$CERT_NAME" "$output_name"
    
    # Final attribute cleanup
    xattr -c "$output_name" 2>/dev/null || true
    
    # Set proper permissions for web serving
    chmod 644 "$output_name"
    
    # Verify
    if hdiutil verify "$output_name" >/dev/null 2>&1; then
        echo "  ✅ $output_name created successfully"
        echo "  📏 Size: $(ls -lh "$output_name" | awk '{print $5}')"
        echo "  🏷️  Attributes: $(xattr "$output_name" 2>/dev/null | wc -l | tr -d ' ')"
        return 0
    else
        echo "  ❌ $output_name creation failed"
        return 1
    fi
}

# Backup existing files
echo "💾 Creating backups..."
for dmg in TimeFlow.dmg TimeFlow-Intel.dmg TimeFlow-ARM.dmg; do
    if [ -f "$dmg" ]; then
        cp "$dmg" "${dmg}-web-backup-$(date +%H%M)"
    fi
done

# Create absolutely clean DMG files
create_clean_dmg "TimeFlow-WebClean.dmg" "Install Alyson Work Time 2"
create_clean_dmg "TimeFlow-Intel-WebClean.dmg" "Install Alyson Work Time 2"  
create_clean_dmg "TimeFlow-ARM-WebClean.dmg" "Install Alyson Work Time 2"

# Replace originals if successful
if [ -f "TimeFlow-WebClean.dmg" ] && [ -f "TimeFlow-Intel-WebClean.dmg" ] && [ -f "TimeFlow-ARM-WebClean.dmg" ]; then
    echo ""
    echo "🔄 Replacing with absolutely clean versions..."
    
    mv TimeFlow-WebClean.dmg TimeFlow.dmg
    mv TimeFlow-Intel-WebClean.dmg TimeFlow-Intel.dmg
    mv TimeFlow-ARM-WebClean.dmg TimeFlow-ARM.dmg
    
    echo ""
    echo "🎉 SUCCESS! Web-clean DMG files created!"
    echo ""
    
    # Final verification
    for dmg in TimeFlow.dmg TimeFlow-Intel.dmg TimeFlow-ARM.dmg; do
        echo "📁 $dmg:"
        echo "  Size: $(ls -lh "$dmg" | awk '{print $5}')"
        echo "  Permissions: $(ls -la "$dmg" | awk '{print $1,$3,$4}')"
        echo "  Extended Attributes: $(xattr "$dmg" 2>/dev/null | wc -l | tr -d ' ')"
        echo "  Integrity: $(hdiutil verify "$dmg" >/dev/null 2>&1 && echo "✅ VALID" || echo "❌ INVALID")"
        echo "  Signature: $(codesign --verify "$dmg" >/dev/null 2>&1 && echo "✅ VALID" || echo "❌ INVALID")"
        echo ""
    done
else
    echo "❌ Failed to create clean DMGs - restoring backups"
    for dmg in TimeFlow.dmg TimeFlow-Intel.dmg TimeFlow-ARM.dmg; do
        backup="${dmg}-web-backup-$(date +%H%M)"
        if [ -f "$backup" ]; then
            mv "$backup" "$dmg"
        fi
    done
fi

# Cleanup
rm -rf clean_web_build

echo "✅ Web-clean DMG creation complete!"
echo "📤 Files are now ready for web deployment without extended attribute issues" 