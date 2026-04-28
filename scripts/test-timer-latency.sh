#!/bin/bash

echo "Timer Latency Test Script"
echo "========================"
echo ""
echo "This script will help you test the timer start latency with verbose logging."
echo ""
echo "Instructions:"
echo "1. Run this script to start the Electron app with verbose logging"
echo "2. Open Time Tracker, select a project"
echo "3. Click Start button"
echo "4. Look for the timing logs in the console (T0-T7)"
echo "5. Copy the timing results back here for analysis"
echo ""
echo "Starting Electron with verbose logging..."
echo ""

cd "$(dirname "$0")/.."

# Run with verbose logging
ELECTRON_ENABLE_LOGGING=1 NODE_ENV=development DEBUG='*' npm run desktop 2>&1 | tee timer-latency-test.log &

echo ""
echo "Electron started. Look for these timing markers in the console:"
echo "- T0: Click handler invocation"
echo "- T1: Before IPC invoke"
echo "- T2: After IPC invoke returns"
echo "- T3: Start-timer handler in main"
echo "- T4: Before Supabase insert"
echo "- T5: After Supabase insert"
echo "- T6: Before sending tracking-started"
echo "- T7: Renderer receives tracking-started"
echo ""
echo "Logs are also being saved to: timer-latency-test.log"
