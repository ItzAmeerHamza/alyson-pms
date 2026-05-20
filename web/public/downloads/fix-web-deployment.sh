#!/bin/bash

echo "🌐 Fixing DMG Files for Web Deployment"
echo "======================================"

# List current files and sizes
echo "📊 Current DMG files:"
ls -la *.dmg

echo ""
echo "🧹 Removing extended attributes (cause of web server corruption)..."

# Remove all extended attributes from DMG files
for dmg in TimeFlow.dmg TimeFlow-Intel.dmg TimeFlow-ARM.dmg; do
    if [ -f "$dmg" ]; then
        echo "  🔧 Cleaning $dmg..."
        
        # Remove all extended attributes
        xattr -c "$dmg"
        
        # Verify attributes are gone
        ATTRS=$(xattr "$dmg" 2>/dev/null)
        if [ -z "$ATTRS" ]; then
            echo "    ✅ Extended attributes removed"
        else
            echo "    ⚠️  Some attributes remain: $ATTRS"
        fi
        
        # Set proper permissions
        chmod 644 "$dmg"
        
        # Verify file integrity
        if hdiutil verify "$dmg" >/dev/null 2>&1; then
            echo "    ✅ DMG integrity verified"
        else
            echo "    ❌ DMG integrity check failed"
        fi
    fi
done

echo ""
echo "📊 Final file status:"
echo "===================="

for dmg in TimeFlow.dmg TimeFlow-Intel.dmg TimeFlow-ARM.dmg; do
    if [ -f "$dmg" ]; then
        echo ""
        echo "📁 $dmg:"
        echo "  Size: $(ls -lh "$dmg" | awk '{print $5}')"
        echo "  Permissions: $(ls -la "$dmg" | awk '{print $1}')"
        echo "  Extended Attributes: $(xattr "$dmg" 2>/dev/null | wc -l | tr -d ' ') attributes"
        echo "  Integrity: $(hdiutil verify "$dmg" >/dev/null 2>&1 && echo "✅ VALID" || echo "❌ INVALID")"
        echo "  SHA256: $(shasum -a 256 "$dmg" | cut -d' ' -f1)"
    fi
done

echo ""
echo "🔧 Web Server Configuration Check:"
echo "=================================="
echo "Make sure your web server (.htaccess) has:"
echo ""
echo "AddType application/octet-stream .dmg"
echo "Header set Content-Type application/octet-stream"
echo "Header set Content-Disposition attachment"
echo ""

# Create a simple PHP test script
cat > test-download.php << 'EOF'
<?php
$file = $_GET['file'] ?? '';
$allowed = ['TimeFlow.dmg', 'TimeFlow-Intel.dmg', 'TimeFlow-ARM.dmg'];

if (!in_array($file, $allowed) || !file_exists($file)) {
    http_response_code(404);
    exit('File not found');
}

// Force download with proper headers
header('Content-Type: application/octet-stream');
header('Content-Disposition: attachment; filename="' . basename($file) . '"');
header('Content-Length: ' . filesize($file));
header('Cache-Control: no-cache, must-revalidate');
header('Expires: 0');

// Output file
readfile($file);
exit;
?>
EOF

echo "📝 Created test-download.php for testing downloads"
echo "   Test with: https://yoursite.com/downloads/test-download.php?file=TimeFlow.dmg"

echo ""
echo "✅ Web deployment preparation complete!"
echo "💡 If downloads still fail, the issue is with your web hosting configuration." 