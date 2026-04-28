#!/bin/bash

# TimeFlow Release Script
# Automates version bumping, building, and publishing for auto-updater

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
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

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to get current version
get_current_version() {
    node -p "require('./package.json').version"
}

# Function to update version in all relevant files
update_version() {
    local new_version=$1
    print_status "Updating version to $new_version in all files..."
    
    # Update package.json
    npm version "$new_version" --no-git-tag-version
    
    # Update desktop-agent config if it exists
    if [[ -f "desktop-agent/config.json" ]]; then
        sed -i '' "s/\"version\": \".*\"/\"version\": \"$new_version\"/" desktop-agent/config.json
    fi
    
    print_success "Version updated to $new_version"
}

# Function to build the application
build_app() {
    print_status "Building the application..."
    
    # Clean previous builds
    rm -rf dist build
    
    # Build web app
    npm run build:dev
    
    # Build electron
    npm run build:electron
    
    # Copy assets
    mkdir -p build/dist && cp -r dist/* build/dist/
    
    print_success "Application built successfully"
}

# Function to create GitHub release
create_github_release() {
    local version=$1
    local tag="v$version"
    
    print_status "Creating GitHub release for version $version..."
    
    # Check if gh CLI is installed
    if ! command_exists gh; then
        print_error "GitHub CLI (gh) is not installed. Please install it first."
        print_warning "You can install it with: brew install gh"
        return 1
    fi
    
    # Check if logged in to GitHub
    if ! gh auth status >/dev/null 2>&1; then
        print_error "Not logged in to GitHub. Please run: gh auth login"
        return 1
    fi
    
    # Create git tag
    git tag "$tag"
    git push origin "$tag"
    
    # Create GitHub release
    gh release create "$tag" \
        --title "TimeFlow v$version" \
        --notes "Auto-generated release for version $version. 

**What's New:**
- Bug fixes and improvements
- Enhanced stability and performance

**For Auto-Update Users:**
You will be automatically notified of this update within 6 hours. You can also manually check for updates through the system tray menu.

**Manual Download:**
If you prefer to download manually, you can find the installation files below." \
        --draft=false \
        --prerelease=false
    
    print_success "GitHub release created: $tag"
}

# Function to build and publish electron app
build_electron_release() {
    print_status "Building Electron release packages..."
    
    # Set environment for publishing
    export NODE_ENV=production
    
    # Build and publish to GitHub releases
    if [[ -n "$GH_TOKEN" ]]; then
        print_status "Publishing to GitHub releases..."
        npm run electron:build
        print_success "Electron app published to GitHub releases"
    else
        print_warning "GH_TOKEN not set. Building without publishing to GitHub."
        npm run electron:build-unsigned
        print_success "Electron app built (unsigned)"
    fi
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [patch|minor|major|<version>] [options]"
    echo ""
    echo "Version types:"
    echo "  patch    - Increment patch version (1.0.0 -> 1.0.1)"
    echo "  minor    - Increment minor version (1.0.0 -> 1.1.0)" 
    echo "  major    - Increment major version (1.0.0 -> 2.0.0)"
    echo "  <version> - Set specific version (e.g., 1.2.3)"
    echo ""
    echo "Options:"
    echo "  --no-build     - Skip building the application"
    echo "  --no-publish   - Skip publishing to GitHub"
    echo "  --dry-run      - Show what would be done without doing it"
    echo "  --help         - Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 patch                    # Increment patch version and publish"
    echo "  $0 minor --no-publish       # Increment minor version, build only"
    echo "  $0 1.5.0 --dry-run          # Show what would happen for version 1.5.0"
}

# Parse command line arguments
VERSION_TYPE=""
NO_BUILD=false
NO_PUBLISH=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        patch|minor|major)
            VERSION_TYPE="$1"
            shift
            ;;
        --no-build)
            NO_BUILD=true
            shift
            ;;
        --no-publish)
            NO_PUBLISH=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help|-h)
            show_usage
            exit 0
            ;;
        *)
            # Check if it's a version number
            if [[ $1 =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
                VERSION_TYPE="$1"
            else
                print_error "Unknown option: $1"
                show_usage
                exit 1
            fi
            shift
            ;;
    esac
done

# Check if version type was provided
if [[ -z "$VERSION_TYPE" ]]; then
    print_error "Version type is required"
    show_usage
    exit 1
fi

# Main execution
main() {
    print_status "Starting TimeFlow release process..."
    
    # Check if we're in a git repository
    if ! git rev-parse --git-dir >/dev/null 2>&1; then
        print_error "Not in a git repository"
        exit 1
    fi
    
    # Check for uncommitted changes
    if [[ -n $(git status --porcelain) ]]; then
        print_error "You have uncommitted changes. Please commit or stash them first."
        exit 1
    fi
    
    # Get current version
    CURRENT_VERSION=$(get_current_version)
    print_status "Current version: $CURRENT_VERSION"
    
    # Calculate new version
    if [[ "$VERSION_TYPE" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        NEW_VERSION="$VERSION_TYPE"
    else
        # Use npm to calculate new version
        NEW_VERSION=$(npm version "$VERSION_TYPE" --dry-run | sed 's/v//')
    fi
    
    print_status "New version will be: $NEW_VERSION"
    
    if [[ "$DRY_RUN" == true ]]; then
        print_warning "DRY RUN MODE - No changes will be made"
        print_status "Would update version to: $NEW_VERSION"
        [[ "$NO_BUILD" == false ]] && print_status "Would build application"
        [[ "$NO_PUBLISH" == false ]] && print_status "Would publish to GitHub"
        exit 0
    fi
    
    # Confirm with user
    read -p "Do you want to continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_warning "Release cancelled by user"
        exit 0
    fi
    
    # Update version
    update_version "$NEW_VERSION"
    
    # Build application
    if [[ "$NO_BUILD" == false ]]; then
        build_app
        build_electron_release
    else
        print_warning "Skipping build (--no-build specified)"
    fi
    
    # Commit version changes
    git add .
    git commit -m "Release version $NEW_VERSION"
    git push origin main
    
    # Publish to GitHub
    if [[ "$NO_PUBLISH" == false ]]; then
        create_github_release "$NEW_VERSION"
    else
        print_warning "Skipping GitHub publish (--no-publish specified)"
    fi
    
    print_success "Release process completed successfully!"
    print_status "Version $NEW_VERSION is now available"
    
    # Show post-release information
    echo ""
    print_status "Post-release checklist:"
    echo "  ✓ Version bumped to $NEW_VERSION"
    [[ "$NO_BUILD" == false ]] && echo "  ✓ Application built and packaged"
    [[ "$NO_PUBLISH" == false ]] && echo "  ✓ GitHub release created"
    echo "  ✓ Git changes committed and pushed"
    echo ""
    print_status "Auto-updater will notify users within 6 hours"
    print_status "Manual downloads available at: https://github.com/your-repo/releases"
}

# Run main function
main 