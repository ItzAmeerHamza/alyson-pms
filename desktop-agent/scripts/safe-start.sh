#!/bin/bash

# 🚨 SAFE DESKTOP AGENT STARTUP SCRIPT
# This script enforces single instance rule and prevents conflicts

set -e  # Exit on any error

echo "🔍 [SAFE-START] Checking for existing desktop agent instances..."

# Check for existing processes
EXISTING_PROCESSES=$(ps aux | grep -E "(desktop-agent|electron.*time-flow)" | grep -v grep | grep -v "safe-start.sh" || true)

if [ -n "$EXISTING_PROCESSES" ]; then
    echo "⚠️  [SAFE-START] Found existing desktop agent processes:"
    echo "$EXISTING_PROCESSES"
    
    echo "🔄 [SAFE-START] Stopping existing instances..."
    
    # Kill existing processes
    pkill -f "desktop-agent" || true
    pkill -f "electron.*time-flow" || true
    
    # Wait for cleanup
    echo "⏳ [SAFE-START] Waiting for process cleanup..."
    sleep 3
    
    # Verify cleanup
    REMAINING_PROCESSES=$(ps aux | grep -E "(desktop-agent|electron.*time-flow)" | grep -v grep | grep -v "safe-start.sh" || true)
    
    if [ -n "$REMAINING_PROCESSES" ]; then
        echo "❌ [SAFE-START] Failed to stop all processes:"
        echo "$REMAINING_PROCESSES"
        echo "🔄 [SAFE-START] Attempting force kill..."
        pkill -9 -f "desktop-agent" || true
        pkill -9 -f "electron.*time-flow" || true
        sleep 2
    fi
    
    echo "✅ [SAFE-START] Process cleanup completed"
else
    echo "✅ [SAFE-START] No existing instances found"
fi

# Final verification
FINAL_CHECK=$(ps aux | grep -E "(desktop-agent|electron.*time-flow)" | grep -v grep | grep -v "safe-start.sh" || true)

if [ -n "$FINAL_CHECK" ]; then
    echo "❌ [SAFE-START] CRITICAL: Still have conflicting processes:"
    echo "$FINAL_CHECK"
    echo "🚨 [SAFE-START] Cannot start safely. Please manually kill all processes."
    exit 1
fi

echo "🚀 [SAFE-START] Starting fresh desktop agent instance..."

# Change to desktop-agent directory
cd "$(dirname "$0")/.."

# Start the application
npm run start

echo "✅ [SAFE-START] Desktop agent started successfully"
