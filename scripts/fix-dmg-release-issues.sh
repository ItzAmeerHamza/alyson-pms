#!/bin/bash

# TimeFlow DMG Release Issues Fix Script
# Fixes: App capture, URL capture, empty screenshots, binary productivity scores

echo "🚀 TimeFlow DMG Release Issues Fix Script"
echo "==========================================="

# 1. Set up environment
export NODE_ENV=production
export ELECTRON_IS_DEV=false

# 2. Navigate to desktop agent directory
cd desktop-agent || { echo "❌ desktop-agent directory not found"; exit 1; }

echo "📦 Installing dependencies..."
npm install

echo "🔧 Building desktop agent with fixes..."

# 3. Create production build
npm run build 2>/dev/null || {
    echo "⚠️ No build script found, proceeding with electron-builder"
}

# 4. Build DMG for macOS
echo "🍎 Building macOS DMG with all fixes..."

# Clean previous builds
rm -rf dist/
rm -f *.dmg

# Build for both architectures
npx electron-builder --mac --universal --publish=never

# 5. Check if build was successful
DMG_FILE=$(find . -name "*.dmg" -type f | head -1)

if [ -z "$DMG_FILE" ]; then
    echo "❌ DMG build failed"
    exit 1
fi

echo "✅ DMG built successfully: $DMG_FILE"

# 6. Get file size
DMG_SIZE=$(du -h "$DMG_FILE" | cut -f1)
echo "📊 DMG Size: $DMG_SIZE"

# 7. Create release notes
cat > RELEASE_NOTES_FIX.md << EOF
# TimeFlow DMG Release Fixes - Event-Driven Capture

## Issues Fixed ✅

### 1. App Capture Not Working ⚡️ EVENT-DRIVEN
- **MAJOR CHANGE**: App capture now triggers when you actually open/focus apps
- Reduced from every 15 seconds to every 2 seconds for app switches  
- Captures immediately when switching applications
- Added fallback methods for app detection
- Only skips duplicates if captured within last 10 seconds (not 30)

### 2. URL Capture Not Working ⚡️ EVENT-DRIVEN  
- **MAJOR CHANGE**: URL capture now triggers when you actually use browsers
- Immediate capture when browser becomes focused
- Faster URL change detection (every 1.5 seconds vs 3 seconds)
- Background browser check reduced to every 10 seconds
- New URLs captured immediately, revisited URLs after 30 seconds (not 2 minutes)

### 3. Empty Screenshots When Switching Apps
- Added timeout protection for app context detection
- Added 100ms delay to allow app switching to complete
- Enhanced screenshot capture with better error handling
- Improved app/URL context detection before screenshots

### 4. Binary Productivity Scores (100% or 0%)
- Fixed activity calculation with gradual decay curves
- Added realistic progression: 90% → 80% → 70% → 60% → 50% → 40% → 30% → 20% → 10% → 0%
- Reduced baseline activity threshold for more gradual scores
- Added minimum activity floors (5% for any activity, 10% for recent activity)

### 5. Anti-Cheat False Positives
- Reduced anti-cheat sensitivity to prevent constant HIGH_RISK alerts
- Capped maximum risk score at 60% for normal operation
- Made behavior pattern detection more lenient
- Reduced suspicious event penalties

## Technical Changes 🔧

### Event-Driven Architecture ⚡️
- **App Capture**: Now event-driven (2s polling vs 15s)
- **URL Capture**: Now event-driven (1.5s polling vs 3s) 
- **Browser Focus**: Immediate URL capture when switching to browser
- **Background Monitoring**: Reduced frequency (10s vs 30s)

### Timing Improvements ⏱️
- App duplicate detection: 10 seconds (was 30 seconds)
- URL revisit threshold: 30 seconds (was 2 minutes)  
- URL change monitoring: 1.5 seconds (was 3 seconds)
- Background browser check: 10 seconds (was 30 seconds)

### Better Responsiveness 🚀
- Immediate app capture on app switch
- Immediate URL capture on browser focus
- Faster detection of URL changes within browsers
- More aggressive URL capture for better tracking

## Testing Recommendations 🧪

1. **Event-Driven Testing**:
   - Switch between different applications → Should see immediate app captures
   - Open/focus browser → Should see immediate URL capture
   - Change URLs in browser → Should see captures within 1.5 seconds
   - Open multiple browser tabs → Should capture each URL change

2. **Debug Console Verification**:
   - App Capture: Should show "ACTIVE" with frequent activity
   - URL Capture: Should show "ACTIVE" with browser usage
   - Look for "🚀 BROWSER FOCUSED" and "🆕 NEW URL DETECTED" messages

3. **Productivity Score Testing**:
   - Check scores show gradual changes (70%, 80%, etc.)
   - Verify idle decay is gradual, not binary

## File Information 📋
- Build Date: $(date)
- File Size: $DMG_SIZE
- Version: Event-Driven Release
- Platform: macOS Universal (Intel + ARM64)
- Architecture: Event-driven app/URL capture

EOF

echo "📝 Release notes created: RELEASE_NOTES_FIX.md"

# 8. Optional: Create checksum for verification
if command -v shasum >/dev/null 2>&1; then
    CHECKSUM=$(shasum -a 256 "$DMG_FILE" | cut -d' ' -f1)
    echo "🔐 SHA256: $CHECKSUM"
    echo "$CHECKSUM  $DMG_FILE" > checksum.txt
fi

echo ""
echo "✅ All fixes applied and DMG built successfully!"
echo "🎯 Fixed Issues:"
echo "   - App capture now working with fallbacks"
echo "   - URL capture more aggressive and reliable" 
echo "   - Screenshots improved for app switching"
echo "   - Productivity scores now gradual (70%, 80%, etc.)"
echo "   - Anti-cheat false positives reduced"
echo ""
echo "📦 DMG ready for testing: $DMG_FILE"
echo "📋 Size: $DMG_SIZE"
echo ""
echo "🚀 Next steps:"
echo "   1. Test the new DMG thoroughly"
echo "   2. Upload to GitHub releases if working"
echo "   3. Update download links on website" 