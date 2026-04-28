#!/bin/bash

# Enable debug logging for app detection
export DEBUG_APP=1
export VERBOSE_LOGGING=1
export NODE_ENV=development

# Start the Electron app with verbose logging
echo "🔍 Starting TimeFlow Desktop Agent with debug logging..."
echo "📝 Logs will be saved to: ./debug-logs/app-detection-$(date +%Y%m%d-%H%M%S).log"

# Create debug logs directory
mkdir -p debug-logs

# Run the app with logging
npm start 2>&1 | tee "./debug-logs/app-detection-$(date +%Y%m%d-%H%M%S).log"
