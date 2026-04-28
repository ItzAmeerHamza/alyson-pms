#!/bin/bash

# 🔐 TIMEFLOW ENVIRONMENT SETUP
# Securely set up environment variables for the release process
# This script should be sourced, not executed: source scripts/setup-environment.sh

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_info "🔐 Setting up TimeFlow release environment..."

# Validate required environment variables
if [[ -z "$APPLE_ID" || -z "$APPLE_APP_SPECIFIC_PASSWORD" || -z "$APPLE_TEAM_ID" ]]; then
    print_error "Missing required Apple Developer credentials!"
    print_error "Please ensure the following environment variables are set:"
    print_error "  - APPLE_ID"
    print_error "  - APPLE_APP_SPECIFIC_PASSWORD" 
    print_error "  - APPLE_TEAM_ID"
    print_warning "These should be configured in Vercel environment variables"
    return 1
fi

# Apple Developer Credentials (use from environment)
export APPLE_ID
export APPLE_APP_SPECIFIC_PASSWORD
export APPLE_TEAM_ID

# GitHub Credentials (optional for web-only deployments)
if [[ -n "$GITHUB_TOKEN" ]]; then
    export GITHUB_TOKEN
else
    print_warning "GITHUB_TOKEN not set (optional for web deployments)"
fi

# Electron Builder Configuration
export CSC_IDENTITY_AUTO_DISCOVERY=false
export CSC_NAME="Developer ID Application: Ebdaa Digital Technology ($APPLE_TEAM_ID)"

# Notarization Configuration
export APPLEID="$APPLE_ID"
export APPLEIDPASS="$APPLE_APP_SPECIFIC_PASSWORD"

print_success "Environment variables configured:"
print_info "  ✅ APPLE_ID: ${APPLE_ID:0:8}...@gmail.com"
print_info "  ✅ APPLE_TEAM_ID: $APPLE_TEAM_ID"
if [[ -n "$GITHUB_TOKEN" ]]; then
    print_info "  ✅ GITHUB_TOKEN: ${GITHUB_TOKEN:0:8}..."
fi
print_info "  ✅ Signing identity configured"

print_success "🚀 Ready for release!"

print_info "💡 Usage:"
print_info "  source scripts/setup-environment.sh"
print_info "  ./scripts/automated-release-pipeline.sh patch" 