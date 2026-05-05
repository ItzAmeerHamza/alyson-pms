#!/bin/bash

# Quick restart script to apply URL tracking fix

echo "🔧 Applying URL tracking fix..."

# Kill existing agent processes
echo "⏹️ Stopping existing agent..."
pkill -f "Electron.*alyson-work-time-agent" 2>/dev/null || true
pkill -f "node.*electron.*desktop-agent" 2>/dev/null || true
sleep 2

# Clear old logs
echo "🧹 Clearing old logs..."
rm -f /tmp/timeflow-start.log 2>/dev/null || true

# Start agent with debugging
echo "🚀 Starting agent with URL fix..."
cd "$HOME/Desktop/alyson-time-doctor/desktop-agent"

# Start the agent and log output
npm start > /tmp/timeflow-start.log 2>&1 &

echo "✅ Agent restarted!"
echo "📋 To monitor URL tracking:"
echo "   tail -f /tmp/timeflow-start.log | grep -E 'URL|capture|QUEUE|SAVE'"
echo ""
echo "🧪 After starting, test by:"
echo "1. Starting tracking in the UI"
echo "2. Visit a website (google.com)"
echo "3. Check console logs for 'SAVED TO DATABASE' instead of errors"
