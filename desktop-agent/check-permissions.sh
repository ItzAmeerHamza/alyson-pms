#!/bin/bash

echo "🔍 Checking macOS Permissions for TimeFlow Desktop Agent"
echo "========================================================"
echo ""

# Function to check if an app has a specific permission
check_permission() {
    local service=$1
    local bundle_id=$2
    local display_name=$3
    
    # Check using tccutil (requires admin privileges for some permissions)
    # This is more of a guide - actual permission status requires system access
    
    echo "📋 $display_name:"
    
    # Try to detect if permission might be granted
    case $service in
        "kTCCServiceScreenCapture")
            # Check if screencapture works
            if screencapture -x /tmp/test_screenshot.png 2>/dev/null && [ -f /tmp/test_screenshot.png ]; then
                echo "   ✅ Screen Recording: Likely GRANTED"
                rm -f /tmp/test_screenshot.png
            else
                echo "   ❌ Screen Recording: Likely DENIED or NOT REQUESTED"
            fi
            ;;
        "kTCCServiceAccessibility")
            # Check if we can use AppleScript with System Events
            if osascript -e 'tell application "System Events" to get name of first application process' &>/dev/null; then
                echo "   ✅ Accessibility: Likely GRANTED"
            else
                echo "   ❌ Accessibility: Likely DENIED or NOT REQUESTED"
            fi
            ;;
        "kTCCServiceListenEvent")
            echo "   ❓ Input Monitoring: Cannot check programmatically"
            ;;
        "kTCCServiceSystemPolicyAllFiles")
            echo "   ❓ Full Disk Access: Cannot check programmatically"
            ;;
    esac
}

# Get Electron app info
ELECTRON_APPS=$(ps aux | grep -i electron | grep -i timeflow | grep -v grep | head -1)

if [ -z "$ELECTRON_APPS" ]; then
    echo "⚠️  TimeFlow Desktop Agent is not running!"
    echo "   Please start the agent first to check its permissions."
    echo ""
else
    echo "✅ TimeFlow Desktop Agent is running"
    echo ""
fi

# Check each permission
check_permission "kTCCServiceScreenCapture" "com.timeflow.desktop" "Screen Recording"
check_permission "kTCCServiceAccessibility" "com.timeflow.desktop" "Accessibility"
check_permission "kTCCServiceListenEvent" "com.timeflow.desktop" "Input Monitoring"
check_permission "kTCCServiceSystemPolicyAllFiles" "com.timeflow.desktop" "Full Disk Access"

echo ""
echo "📌 To manually check/grant permissions:"
echo "   1. Open System Settings > Privacy & Security"
echo "   2. Check these sections:"
echo "      - Screen Recording"
echo "      - Accessibility"
echo "      - Input Monitoring"
echo "      - Full Disk Access"
echo "   3. Look for TimeFlow Desktop Agent or Electron"
echo "   4. Toggle permissions ON if they're OFF"
echo ""

# Test frontmost app detection
echo "🧪 Testing Frontmost App Detection:"
echo "-----------------------------------"

# Method 1: AppleScript
echo -n "Method 1 (AppleScript): "
if osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true' 2>/dev/null; then
    APP_NAME=$(osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true' 2>/dev/null)
    echo "✅ Working - Current app: $APP_NAME"
else
    echo "❌ Failed - Accessibility permission likely missing"
fi

# Method 2: Check if we can get bundle ID
echo -n "Method 2 (Bundle ID): "
if osascript -e 'tell application "System Events" to get bundle identifier of first application process whose frontmost is true' 2>/dev/null; then
    BUNDLE_ID=$(osascript -e 'tell application "System Events" to get bundle identifier of first application process whose frontmost is true' 2>/dev/null)
    echo "✅ Working - Bundle ID: $BUNDLE_ID"
else
    echo "❌ Failed - Accessibility permission likely missing"
fi

echo ""
echo "📸 Screenshot Permission Test:"
echo "------------------------------"
if screencapture -x /tmp/permission_test.png 2>/dev/null; then
    if [ -f /tmp/permission_test.png ]; then
        FILE_SIZE=$(ls -la /tmp/permission_test.png | awk '{print $5}')
        echo "✅ Screenshot captured successfully (Size: $FILE_SIZE bytes)"
        rm -f /tmp/permission_test.png
    else
        echo "❌ Screenshot command ran but no file created"
    fi
else
    echo "❌ Screenshot failed - Screen Recording permission likely missing"
fi

echo ""
echo "✨ Done! Review the results above and grant any missing permissions."
