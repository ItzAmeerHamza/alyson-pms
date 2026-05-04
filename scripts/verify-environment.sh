#!/bin/bash

# 🔍 Environment Verification Script
# Checks if everything is set up correctly for TimeFlow release

echo "🔍 Verifying TimeFlow Build Environment..."

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ This script must be run on macOS for Apple code signing"
    exit 1
fi

echo "✅ Running on macOS"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js"
    exit 1
fi

NODE_VERSION=$(node --version)
echo "✅ Node.js found: $NODE_VERSION"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found"
    exit 1
fi

NPM_VERSION=$(npm --version)
echo "✅ npm found: $NPM_VERSION"

# Check GitHub CLI
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI not found. Install with: brew install gh"
    exit 1
fi

GH_VERSION=$(gh --version | head -n1)
echo "✅ GitHub CLI found: $GH_VERSION"

# Check if logged into GitHub
if ! gh auth status &> /dev/null; then
    echo "❌ Not logged into GitHub CLI. Run: gh auth login"
    exit 1
fi

echo "✅ GitHub CLI authenticated"

# Check for Developer ID certificate
echo "🔐 Checking for Apple Developer certificates..."

if ! security find-identity -v -p codesigning | grep -q "Developer ID Application"; then
    echo "❌ No Developer ID Application certificates found"
    echo "Please install your Developer ID certificate in Keychain Access"
    exit 1
fi

# Check for specific certificate
if security find-identity -v -p codesigning | grep -q "RevCloud (6GW49LK9V9)"; then
    echo "✅ Found RevCloud certificate"
else
    echo "⚠️  Warning: RevCloud certificate not found"
    echo "Available certificates:"
    security find-identity -v -p codesigning
fi

# Check environment variables
echo ""
echo "🌍 Environment Variables:"

if [ -z "$APPLE_ID" ]; then
    echo "⚠️  APPLE_ID not set. Set with: export APPLE_ID='${APPLE_ID}'"
else
    echo "✅ APPLE_ID: $APPLE_ID"
fi

if [ -z "$APPLE_APP_SPECIFIC_PASSWORD" ]; then
    echo "⚠️  APPLE_APP_SPECIFIC_PASSWORD not set"
else
    echo "✅ APPLE_APP_SPECIFIC_PASSWORD: [HIDDEN]"
fi

if [ -z "$APPLE_TEAM_ID" ]; then
    echo "⚠️  APPLE_TEAM_ID not set. Set with: export APPLE_TEAM_ID='6GW49LK9V9'"
else
    echo "✅ APPLE_TEAM_ID: $APPLE_TEAM_ID"
fi

if [ -z "$GITHUB_TOKEN" ]; then
    echo "⚠️  GITHUB_TOKEN not set"
else
    echo "✅ GITHUB_TOKEN: [HIDDEN]"
fi

# Check project files
echo ""
echo "📁 Project Files:"

REQUIRED_FILES=(
    "package.json"
    "src/pages/download/index.tsx"
    "src/components/ui/desktop-download.tsx"
    "build/entitlements.mac.plist"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file exists"
    else
        echo "❌ $file missing"
    fi
done

# Check current version
if [ -f "package.json" ]; then
    CURRENT_VERSION=$(grep '"version"' package.json | cut -d'"' -f4)
    echo "📦 Current version: $CURRENT_VERSION"
fi

echo ""
echo "🎯 Quick Setup Commands:"
echo "========================"
echo "# Set Apple credentials:"
echo "export APPLE_ID='${APPLE_ID}'"
echo "export APPLE_APP_SPECIFIC_PASSWORD='${APPLE_APP_SPECIFIC_PASSWORD}'"
echo "export APPLE_TEAM_ID='6GW49LK9V9'"
echo "export GITHUB_TOKEN='${GITHUB_TOKEN}'"
echo ""
echo "# Install GitHub CLI (if needed):"
echo "brew install gh"
echo ""
echo "# Login to GitHub (if needed):"
echo "gh auth login"
echo ""
echo "🚀 Ready to build? Run:"
echo "  ./scripts/test-build-v1.0.40.sh      # Test build only"
echo "  ./scripts/complete-release-v1.0.40.sh # Full release" 