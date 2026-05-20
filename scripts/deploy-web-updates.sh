#!/bin/bash

# Deploy Web App Updates Script
# Updates the web application with latest download links

set -e

echo "🌐 Deploying Web App Updates to Vercel..."
echo "========================================"

# Get current version
CURRENT_VERSION=$(node -p "require('./web/package.json').version")
echo "📦 Current version: $CURRENT_VERSION"

# Build the web application
echo "🔨 Building web application..."
npm run build -w web

# Deploy to Vercel
echo "🚀 Deploying to Vercel..."
npx vercel --prod

echo "✅ Web app deployment complete!"
echo "🌐 Live at: https://worktime.ebdaadt.com"
echo "📱 Download page: https://worktime.ebdaadt.com/download"
echo ""
echo "Updated download links now point to:"
echo "- TimeFlow-v$CURRENT_VERSION-ARM64.dmg (macOS Apple Silicon)"
echo "- TimeFlow-v$CURRENT_VERSION-Intel.dmg (macOS Intel)"  
echo "- TimeFlow-v$CURRENT_VERSION-Setup.exe (Windows)"
echo "- TimeFlow-v$CURRENT_VERSION-Linux.AppImage (Linux)" 