#!/bin/bash

# Script to test focus calculation with live monitoring

echo "🔧 Testing Focus Calculation Live..."
echo ""

# Kill any existing desktop agent
echo "🛑 Stopping any existing desktop agent..."
pkill -f "electron.*desktop-agent" || true
sleep 2

# Start desktop agent and monitor output
echo "📱 Starting desktop agent with live monitoring..."
cd desktop-agent

# Start the agent and capture output
npm start 2>&1 | while IFS= read -r line; do
    echo "$line"
    
    # Check for focus-related logs
    if echo "$line" | grep -qE "FOCUS|focus_percent|Focus calculation|SCREENSHOT-SAVE.*Focus"; then
        echo ">>> 🎯 FOCUS LOG DETECTED: $line" >&2
    fi
    
    # Check for screenshot saves
    if echo "$line" | grep -q "SCREENSHOT-SAVE.*Activity data"; then
        echo ">>> 📸 SCREENSHOT SAVED: $line" >&2
    fi
done
