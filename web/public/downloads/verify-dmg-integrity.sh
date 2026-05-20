#!/bin/bash

echo "🔍 DMG Integrity Verification Report"
echo "===================================="

# Function to get file info
check_dmg() {
    local file=$1
    echo ""
    echo "📁 Checking: $file"
    echo "   Size: $(ls -lh "$file" | awk '{print $5}')"
    echo "   Modified: $(stat -f "%Sm" "$file")"
    
    # Check if file exists and is readable
    if [ ! -f "$file" ]; then
        echo "   ❌ File does not exist"
        return 1
    fi
    
    # Verify DMG integrity
    echo "   🔍 Running integrity check..."
    if hdiutil verify "$file" >/dev/null 2>&1; then
        echo "   ✅ DMG integrity: VALID"
    else
        echo "   ❌ DMG integrity: CORRUPTED"
        return 1
    fi
    
    # Check code signature
    echo "   🔐 Checking code signature..."
    if codesign --verify --verbose "$file" >/dev/null 2>&1; then
        echo "   ✅ Code signature: VALID"
    else
        echo "   ⚠️  Code signature: INVALID or MISSING"
    fi
    
    # Generate checksum for download verification
    echo "   📊 Generating checksum..."
    local checksum=$(shasum -a 256 "$file" | cut -d' ' -f1)
    echo "   SHA256: $checksum"
    
    # Try to mount (quick test)
    echo "   🗂️  Testing mount..."
    local mount_point="/tmp/dmg_test_$$"
    mkdir -p "$mount_point"
    if hdiutil attach "$file" -mountpoint "$mount_point" -nobrowse -quiet >/dev/null 2>&1; then
        echo "   ✅ Mount test: SUCCESS"
        hdiutil detach "$mount_point" -quiet >/dev/null 2>&1
        rmdir "$mount_point"
    else
        echo "   ❌ Mount test: FAILED"
        rmdir "$mount_point" 2>/dev/null
        return 1
    fi
    
    return 0
}

# Check all DMG files
echo "Starting verification of all DMG files..."

check_dmg "TimeFlow.dmg"
check_dmg "TimeFlow-Intel.dmg" 
check_dmg "TimeFlow-ARM.dmg"
check_dmg "TimeFlow-Signed.dmg"

echo ""
echo "📋 Summary:"
echo "==========="

# Create checksums file for web verification
echo "Creating checksums.txt for download verification..."
cat > checksums.txt << EOF
# TimeFlow DMG Checksums - $(date)
# Use these to verify download integrity

$(shasum -a 256 TimeFlow.dmg)
$(shasum -a 256 TimeFlow-Intel.dmg)
$(shasum -a 256 TimeFlow-ARM.dmg)
$(shasum -a 256 TimeFlow-Signed.dmg)
EOF

echo "✅ Checksums saved to checksums.txt"
echo ""
echo "🔧 Troubleshooting Tips:"
echo "• If downloads are corrupted, check web server MIME types"
echo "• Ensure .dmg files are served as application/octet-stream"
echo "• Clear browser cache before testing downloads"
echo "• Verify file sizes match during download"
echo ""
echo "📊 Use checksums.txt to verify downloaded files with:"
echo "   shasum -a 256 downloaded_file.dmg" 