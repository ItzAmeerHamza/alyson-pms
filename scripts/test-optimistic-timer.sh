#!/bin/bash

echo "Optimistic Timer Start Test Script"
echo "=================================="
echo ""
echo "This script tests the timer's ability to start immediately regardless of network conditions."
echo ""

# Function to test with simulated network latency
test_with_latency() {
    local latency=$1
    local description=$2
    
    echo ""
    echo "Test: $description"
    echo "Expected: Timer starts within 150ms of click"
    echo ""
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS - add network latency using dnctl
        echo "Setting up network latency of ${latency}ms..."
        
        # Create a pipe and configure it
        sudo dnctl pipe 1 config delay ${latency}ms
        
        # Route traffic through the pipe
        echo "dummynet in proto tcp from any to any pipe 1" | sudo pfctl -f -
        sudo pfctl -e 2>/dev/null || true
        
        echo "Network latency configured. Start the app and test..."
        echo "Press Enter when done testing..."
        read
        
        # Clean up
        sudo pfctl -F all -f /etc/pf.conf 2>/dev/null || true
        sudo dnctl -q flush
        sudo pfctl -d 2>/dev/null || true
    else
        echo "Manual test required: Add ${latency}ms latency to your network or database connection"
        echo "Press Enter when ready to continue..."
        read
    fi
}

# Test scenarios
echo "Starting test scenarios..."
echo ""

echo "1. Normal Network Conditions"
echo "----------------------------"
echo "Expected behavior:"
echo "- Timer UI starts immediately (< 150ms)"
echo "- 'Tracking...' appears on button"
echo "- Timer counts up from 00:00:00"
echo "- DB write completes in background"
echo ""
echo "Press Enter to start test..."
read

cd "$(dirname "$0")/.."
ELECTRON_ENABLE_LOGGING=1 NODE_ENV=development npm run desktop &
ELECTRON_PID=$!

echo ""
echo "App started. Test the timer and observe:"
echo "- Click latency (should be < 150ms)"
echo "- Look for timing logs T0-T7"
echo ""
echo "Press Enter to continue to next test..."
read

# Kill the app
kill $ELECTRON_PID 2>/dev/null

# Test with high latency
echo ""
echo "2. High Network Latency Test (500ms)"
echo "------------------------------------"
test_with_latency 500 "High latency network"

echo ""
echo "3. Very High Network Latency Test (2000ms)"
echo "------------------------------------------"
test_with_latency 2000 "Very high latency network"

echo ""
echo "4. Offline Test"
echo "---------------"
echo "Instructions:"
echo "1. Disconnect from network/internet"
echo "2. Start the app"
echo "3. Click Start timer"
echo ""
echo "Expected behavior:"
echo "- Timer starts immediately"
echo "- Timer continues counting"
echo "- Error notification appears"
echo "- When reconnected, data syncs automatically"
echo ""
echo "Press Enter when ready..."
read

echo ""
echo "Test Summary"
echo "============"
echo ""
echo "✓ Optimistic timer should start within 150ms in ALL scenarios"
echo "✓ Network conditions should NOT block UI updates"
echo "✓ Failed DB writes should be queued for retry"
echo "✓ Timer should reconcile with server time when DB write succeeds"
echo ""
echo "If any test failed, the optimistic implementation needs adjustment."
