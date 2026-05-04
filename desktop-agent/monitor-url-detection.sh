#!/bin/bash

# Monitor URL Detection in Real-Time
# This script monitors the desktop agent logs for URL detection activity

echo "🔍 Monitoring TimeFlow URL Detection in Real-Time..."
echo "Press Ctrl+C to stop monitoring"
echo ""

# Check if desktop agent is running
if ! pgrep -f "electron.*alyson-time-doctor" > /dev/null; then
    echo "❌ Desktop agent is not running!"
    echo "💡 Start it with: npm run start"
    exit 1
fi

echo "✅ Desktop agent is running"
echo ""

# Function to check if timer is active
check_timer_status() {
    if [ -f "debug-logs/latest-run.log" ]; then
        if grep -q "Tracking started\|Timer started\|isTracking.*true" "debug-logs/latest-run.log" 2>/dev/null; then
            echo "✅ Timer is active - URL capture should be working"
        else
            echo "⚠️ Timer may not be active - start timer in desktop agent UI"
        fi
    fi
}

# Check initial timer status
check_timer_status
echo ""

# Start monitoring with different filters
echo "📊 Starting real-time monitoring..."
echo ""

# Monitor URL detection events
echo "🌐 URL Detection Events:"
tail -f debug-logs/latest-run.log | grep --line-buffered -E "\[URL\]|URL|url" &

# Monitor browser detection
echo "🌍 Browser Detection:"
tail -f debug-logs/latest-run.log | grep --line-buffered -E "\[BROWSER\]|BROWSER|browser|Safari|Chrome|Firefox" &

# Monitor database operations
echo "💾 Database Operations:"
tail -f debug-logs/latest-run.log | grep --line-buffered -E "\[DB\]|DB|database|insert|save|sync" &

# Monitor URL fixes
echo "🔧 URL Fixes:"
tail -f debug-logs/latest-run.log | grep --line-buffered -E "\[URL-FIX\]|URL-FIX|isPolling|polling" &

# Monitor errors
echo "❌ Errors:"
tail -f debug-logs/latest-run.log | grep --line-buffered -E "ERROR|Error|error|FAILED|Failed|failed" &

# Wait for user interrupt
echo ""
echo "🎯 Monitoring active! Navigate to websites in Safari/Chrome to test URL detection."
echo "Look for these success patterns:"
echo "   🔧 [URL-FIX] Setting isPolling to true"
echo "   🔧 [URL-FIX] captureCurrentUrl: Calling platform adapter..."
echo "   🌐 [URL] EVENT RECEIVED: { url: \"...\", source: \"...\" }"
echo "   ✅ [URL] Direct DB insert to app_url_activity succeeded: ..."
echo ""
echo "Press Ctrl+C to stop monitoring"

# Wait for interrupt
wait
