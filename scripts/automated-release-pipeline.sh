#!/bin/bash

# 🚀 AUTOMATED TIMEFLOW RELEASE PIPELINE
# This script handles the complete release process with signing and notarization
# Author: AI Assistant
# Usage: ./scripts/automated-release-pipeline.sh [patch|minor|major]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
GITHUB_OWNER="mafatah"
GITHUB_REPO="time-flow-admin"

# Print colored output
print_status() {
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

# Validate prerequisites
validate_prerequisites() {
    print_status "🔍 Validating prerequisites..."
    
    # Check required tools
    local tools=("npm" "gh" "security" "codesign" "shasum")
    for tool in "${tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            print_error "Required tool '$tool' is not installed"
            exit 1
        fi
    done
    
    # Check notarytool through xcrun
    if ! xcrun notarytool --version &> /dev/null; then
        print_error "notarytool is not available through xcrun"
        exit 1
    fi
    
    # Check environment variables
    if [[ -z "$APPLE_ID" ]]; then
        print_error "APPLE_ID environment variable is not set"
        exit 1
    fi
    
    if [[ -z "$APPLE_APP_SPECIFIC_PASSWORD" ]]; then
        print_error "APPLE_APP_SPECIFIC_PASSWORD environment variable is not set"
        exit 1
    fi
    
    if [[ -z "$APPLE_TEAM_ID" ]]; then
        print_error "APPLE_TEAM_ID environment variable is not set"
        exit 1
    fi
    
    if [[ -z "$GITHUB_TOKEN" ]]; then
        print_error "GITHUB_TOKEN environment variable is not set"
        exit 1
    fi
    
    # Check signing identity
    if ! security find-identity -v -p codesigning | grep -q "Developer ID Application: Ebdaa Digital Technology (6GW49LK9V9)"; then
        print_error "Code signing identity not found in keychain"
        print_error "Please ensure 'Developer ID Application: Ebdaa Digital Technology (6GW49LK9V9)' is installed"
        exit 1
    fi
    
    print_success "All prerequisites validated"
}

# Set environment variables
setup_environment() {
    print_status "🔧 Setting up environment..."
    
    # Validate required environment variables
    if [[ -z "$APPLE_ID" || -z "$APPLE_APP_SPECIFIC_PASSWORD" || -z "$APPLE_TEAM_ID" ]]; then
        print_error "Missing required Apple Developer credentials!"
        print_error "Please ensure environment variables are set in Vercel"
        exit 1
    fi
    
    # Use environment variables directly (no fallbacks needed since they're in Vercel)
    export APPLE_ID
    export APPLE_APP_SPECIFIC_PASSWORD
    export APPLE_TEAM_ID
    export GITHUB_TOKEN
    
    # Set electron-builder environment variables for notarization
    export APPLEID="$APPLE_ID"
    export APPLEIDPASS="$APPLE_APP_SPECIFIC_PASSWORD"
    export APPLE_TEAM_ID="$APPLE_TEAM_ID"
    
    print_success "Environment configured from Vercel variables"
}

# Bump version
bump_version() {
    local version_type="${1:-patch}"
    print_status "📈 Bumping version ($version_type)..." >&2
    
    # Bump version in package.json
    NEW_VERSION=$(npm version "$version_type" --no-git-tag-version)
    NEW_VERSION=${NEW_VERSION#v} # Remove 'v' prefix
    
    print_success "Version bumped to $NEW_VERSION" >&2
    echo "$NEW_VERSION"
}

# Update download URLs in web application
update_download_urls() {
    local version="$1"
    print_status "🔗 Updating download URLs to version $version..."
    
    # Update src/pages/download/index.tsx
    sed -i.bak "s/const version = \"v[0-9]\+\.[0-9]\+\.[0-9]\+\"/const version = \"v$version\"/" src/pages/download/index.tsx
    
    # Update src/components/ui/desktop-download.tsx
    sed -i.bak "s/const currentVersion = \"[0-9]\+\.[0-9]\+\.[0-9]\+\"/const currentVersion = \"$version\"/" src/components/ui/desktop-download.tsx
    
    # Remove backup files
    rm -f src/pages/download/index.tsx.bak src/components/ui/desktop-download.tsx.bak
    
    print_success "Download URLs updated"
}

# Build web application
build_web() {
    print_status "🌐 Building web application..."
    
    npm run build
    
    print_success "Web application built"
}

# Build desktop applications with signing and notarization
build_desktop() {
    print_status "🖥️ Building desktop applications..."
    
    # Clean previous builds
    rm -rf dist
    
    # Enter desktop-agent directory
    cd desktop-agent
    
    # Validate required environment variables
    if [ -z "$VITE_SUPABASE_URL" ] || [ -z "$VITE_SUPABASE_ANON_KEY" ]; then
        print_error "Missing required environment variables:"
        print_error "   VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set"
        print_error "💡 Please set these in your shell environment before running the release script"
        exit 1
    fi
    
    # Set up environment variables for build
    export VITE_SUPABASE_URL="$VITE_SUPABASE_URL"
    export VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY"
    
    print_status "🔧 Generating embedded configuration..."
    node generate-env-config.js --build
    
    # Build with electron-builder (includes signing and notarization)
    # Build for all platforms: macOS, Windows, and Linux
    npx electron-builder --mac --win --linux --publish=never
    
    # Return to root directory
    cd ..
    
    print_success "Desktop applications built and signed"
}

# Generate file information for auto-updater
generate_file_info() {
    local version="$1"
    print_status "📊 Generating file information..." >&2
    
    local intel_dmg="dist/Ebdaa Work Time-${version}.dmg"
    local arm_dmg="dist/Ebdaa Work Time-${version}-arm64.dmg"
    local win_exe="dist/Ebdaa Work Time Setup ${version}.exe"
    local linux_appimage="dist/Ebdaa Work Time-${version}.AppImage"
    
    # Check macOS files (required)
    if [[ ! -f "$intel_dmg" ]]; then
        print_error "Intel DMG not found: $intel_dmg" >&2
        exit 1
    fi
    
    if [[ ! -f "$arm_dmg" ]]; then
        print_error "ARM64 DMG not found: $arm_dmg" >&2
        exit 1
    fi
    
    # Get macOS file sizes and hashes
    local intel_size=$(stat -f%z "$intel_dmg")
    local arm_size=$(stat -f%z "$arm_dmg")
    local intel_sha512=$(shasum -a 512 "$intel_dmg" | awk '{print $1}')
    local arm_sha512=$(shasum -a 512 "$arm_dmg" | awk '{print $1}')
    
    echo "INTEL_SIZE=$intel_size"
    echo "ARM_SIZE=$arm_size"
    echo "INTEL_SHA512=$intel_sha512"
    echo "ARM_SHA512=$arm_sha512"
    
    # Check for Windows build (optional)
    if [[ -f "$win_exe" ]]; then
        local win_size=$(stat -f%z "$win_exe")
        local win_sha512=$(shasum -a 512 "$win_exe" | awk '{print $1}')
        echo "WIN_SIZE=$win_size"
        echo "WIN_SHA512=$win_sha512"
        echo "WIN_AVAILABLE=true"
    else
        print_warning "Windows build not found: $win_exe" >&2
        echo "WIN_AVAILABLE=false"
    fi
    
    # Check for Linux build (optional)
    if [[ -f "$linux_appimage" ]]; then
        local linux_size=$(stat -f%z "$linux_appimage")
        local linux_sha512=$(shasum -a 512 "$linux_appimage" | awk '{print $1}')
        echo "LINUX_SIZE=$linux_size"
        echo "LINUX_SHA512=$linux_sha512"
        echo "LINUX_AVAILABLE=true"
    else
        print_warning "Linux build not found: $linux_appimage" >&2
        echo "LINUX_AVAILABLE=false"
    fi
    
    print_success "File information generated" >&2
}

# Update auto-updater configuration
update_auto_updater_config() {
    local version="$1"
    local intel_size="$2"
    local arm_size="$3"
    local intel_sha512="$4"
    local arm_sha512="$5"
    
    print_status "⚙️ Updating auto-updater configuration..."
    
    local release_date=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
    
    # Update latest-mac.yml
    cat > latest-mac.yml << EOF
version: $version
files:
  - url: TimeFlow-v$version-Intel.dmg
    sha512: $intel_sha512
    size: $intel_size
  - url: TimeFlow-v$version-ARM64.dmg
    sha512: $arm_sha512
    size: $arm_size
path: TimeFlow-v$version-Intel.dmg
sha512: $intel_sha512
releaseDate: '$release_date'
EOF
    
    # Update latest.yml (Windows placeholder)
    cat > latest.yml << EOF
version: $version
files:
  - url: TimeFlow-v$version-Setup.exe
    sha512: placeholder
    size: 90000000
path: TimeFlow-v$version-Setup.exe
sha512: placeholder
releaseDate: '$release_date'
EOF
    
    print_success "Auto-updater configuration updated"
}

# Copy files to public downloads directory
copy_to_downloads() {
    local version="$1"
    print_status "📁 Copying files to downloads directory..."
    
    mkdir -p public/downloads
    
    cp "dist/Ebdaa Work Time-${version}.dmg" "public/downloads/TimeFlow-v${version}-Intel.dmg"
    cp "dist/Ebdaa Work Time-${version}-arm64.dmg" "public/downloads/TimeFlow-v${version}-ARM64.dmg"
    
    print_success "Files copied to downloads directory"
}

# Create GitHub release
create_github_release() {
    local version="$1"
    local win_available="$2"
    local linux_available="$3"
    print_status "🐙 Creating GitHub release..."
    
    local intel_dmg="dist/Ebdaa Work Time-${version}.dmg"
    local arm_dmg="dist/Ebdaa Work Time-${version}-arm64.dmg"
    local win_exe="dist/Ebdaa Work Time Setup ${version}.exe"
    local linux_appimage="dist/Ebdaa Work Time-${version}.AppImage"
    
    # Build download links based on available platforms
    local download_links="- **macOS (Apple Silicon)**: [TimeFlow-v${version}-ARM64.dmg](https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${version}/TimeFlow-v${version}-ARM64.dmg)
- **macOS (Intel)**: [TimeFlow-v${version}-Intel.dmg](https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${version}/TimeFlow-v${version}-Intel.dmg)"
    
    if [[ "$win_available" == "true" ]]; then
        download_links="${download_links}
- **Windows**: [TimeFlow-v${version}-Setup.exe](https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${version}/TimeFlow-v${version}-Setup.exe)"
    fi
    
    if [[ "$linux_available" == "true" ]]; then
        download_links="${download_links}
- **Linux**: [TimeFlow-v${version}-Linux.AppImage](https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${version}/TimeFlow-v${version}-Linux.AppImage)"
    fi
    
    # Generate release notes
    local release_notes="## TimeFlow v${version}

### 🚀 **New Features & Improvements**
- Enhanced screenshot capture (3 per 10 minutes)
- Improved idle detection system
- Production-ready configurations
- Performance optimizations

### 🔧 **Technical Updates**
- Signed and notarized macOS builds
- Updated auto-updater configuration
- Cross-platform compatibility improvements
- Security enhancements

### 📱 **Downloads**
${download_links}

### 🔄 **Auto-Update**
Existing users will be automatically notified of this update.

---
*Built with signing and notarization for enhanced security*"

    # Build asset list for gh release create
    local assets=("$intel_dmg#TimeFlow-v${version}-Intel.dmg" "$arm_dmg#TimeFlow-v${version}-ARM64.dmg" "latest-mac.yml")
    
    if [[ "$win_available" == "true" ]]; then
        assets+=("$win_exe#TimeFlow-v${version}-Setup.exe")
    fi
    
    if [[ "$linux_available" == "true" ]]; then
        assets+=("$linux_appimage#TimeFlow-v${version}-Linux.AppImage")
    fi
    
    # Create release with assets
    gh release create "v${version}" \
        "${assets[@]}" \
        --title "TimeFlow v${version} - Enhanced Productivity Tracking" \
        --notes "$release_notes" \
        --latest
    
    print_success "GitHub release created: https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tag/v${version}"
}

# Commit and push changes
commit_and_push() {
    local version="$1"
    print_status "📝 Committing and pushing changes..."
    
    git add -A
    git commit -m "🚀 Release v${version} - Enhanced productivity tracking

- Updated version to ${version}
- Enhanced screenshot capture frequency
- Improved idle detection system
- Updated auto-updater configuration
- Code-signed and notarized builds"
    
    git push origin main
    
    print_success "Changes committed and pushed"
}

# Verify release
verify_release() {
    local version="$1"
    print_status "✅ Verifying release..."
    
    # Check GitHub release
    local release_url="https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tag/v${version}"
    print_status "Release URL: $release_url"
    
    # Check auto-updater config
    local config_url="https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${version}/latest-mac.yml"
    print_status "Auto-updater config: $config_url"
    
    # Verify files exist
    if gh release view "v${version}" &>/dev/null; then
        print_success "GitHub release verified"
    else
        print_error "GitHub release verification failed"
        exit 1
    fi
    
    print_success "Release verification completed"
}

# Main function
main() {
    local version_type="${1:-patch}"
    
    print_status "🚀 Starting TimeFlow automated release pipeline..."
    print_status "Version type: $version_type"
    
    # Validate prerequisites
    validate_prerequisites
    
    # Setup environment
    setup_environment
    
    # Bump version
    local new_version
    new_version=$(bump_version "$version_type")
    
    print_status "🎯 Releasing version $new_version"
    
    # Update download URLs
    update_download_urls "$new_version"
    
    # Build web application
    build_web
    
    # Build desktop applications
    build_desktop
    
    # Generate file information
    local file_info
    file_info=$(generate_file_info "$new_version")
    
    # Parse file information
    local intel_size arm_size intel_sha512 arm_sha512 win_available linux_available
    intel_size=$(echo "$file_info" | grep "INTEL_SIZE=" | cut -d'=' -f2)
    arm_size=$(echo "$file_info" | grep "ARM_SIZE=" | cut -d'=' -f2)
    intel_sha512=$(echo "$file_info" | grep "INTEL_SHA512=" | cut -d'=' -f2)
    arm_sha512=$(echo "$file_info" | grep "ARM_SHA512=" | cut -d'=' -f2)
    win_available=$(echo "$file_info" | grep "WIN_AVAILABLE=" | cut -d'=' -f2)
    linux_available=$(echo "$file_info" | grep "LINUX_AVAILABLE=" | cut -d'=' -f2)
    
    # Update auto-updater configuration
    update_auto_updater_config "$new_version" "$intel_size" "$arm_size" "$intel_sha512" "$arm_sha512"
    
    # Copy files to downloads directory
    copy_to_downloads "$new_version"
    
    # Create GitHub release
    create_github_release "$new_version" "$win_available" "$linux_available"
    
    # Commit and push changes
    commit_and_push "$new_version"
    
    # Verify release
    verify_release "$new_version"
    
    print_success "🎉 Release v${new_version} completed successfully!"
    print_success "🔗 Release URL: https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tag/v${new_version}"
    print_success "🌐 Web deployment will be automatically triggered by Vercel"
    
    print_status "📋 Next steps:"
    print_status "1. Verify the release on GitHub"
    print_status "2. Test auto-updater functionality"
    print_status "3. Monitor web deployment on Vercel"
    print_status "4. Announce the release to users"
}

# Help function
show_help() {
    echo "🚀 TimeFlow Automated Release Pipeline"
    echo ""
    echo "Usage: $0 [VERSION_TYPE]"
    echo ""
    echo "VERSION_TYPE:"
    echo "  patch   - Increment patch version (x.x.X) [default]"
    echo "  minor   - Increment minor version (x.X.x)"
    echo "  major   - Increment major version (X.x.x)"
    echo ""
    echo "Environment Variables Required:"
    echo "  APPLE_ID                    - Apple ID for notarization"
    echo "  APPLE_APP_SPECIFIC_PASSWORD - App-specific password"
    echo "  APPLE_TEAM_ID              - Apple Developer Team ID"
    echo "  GITHUB_TOKEN               - GitHub personal access token"
    echo ""
    echo "Example:"
    echo "  $0 patch   # Release v1.0.29"
    echo "  $0 minor   # Release v1.1.0"
    echo "  $0 major   # Release v2.0.0"
}

# Check if help is requested
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    show_help
    exit 0
fi

# Run main function
main "$@" 