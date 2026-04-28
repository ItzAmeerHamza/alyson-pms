#!/bin/bash

# Update auto-update configuration files for TimeFlow
# This script updates latest.yml and latest-mac.yml with new release information

set -e

# Configuration
VERSION="1.0.22"
GITHUB_REPO="mafatah/time-flow-admin"
BASE_URL="https://github.com/${GITHUB_REPO}/releases/download/v${VERSION}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔄 Updating Auto-Update Configuration Files${NC}"
echo "=============================================="

# Function to calculate SHA512 and size
get_file_info() {
    local file_path="$1"
    local file_url="$2"
    
    if [[ -f "$file_path" ]]; then
        local sha512=$(shasum -a 512 "$file_path" | cut -d' ' -f1)
        local size=$(stat -f%z "$file_path" 2>/dev/null || stat -c%s "$file_path" 2>/dev/null)
        echo "url: $file_url"
        echo "sha512: $sha512"
        echo "size: $size"
    else
        echo "File not found: $file_path"
        return 1
    fi
}

# Function to create macOS auto-update configuration
create_mac_config() {
    echo -e "${YELLOW}📱 Creating macOS auto-update configuration...${NC}"
    
    local config_file="latest-mac.yml"
    local intel_dmg=""
    local arm64_dmg=""
    local intel_info=""
    local arm64_info=""
    
    # Find DMG files in dist directory
    cd dist
    
    for dmg in *.dmg; do
        if [[ -f "$dmg" ]]; then
            if [[ "$dmg" == *"Intel"* ]] || [[ "$dmg" == *"x64"* ]]; then
                intel_dmg="$dmg"
            elif [[ "$dmg" == *"ARM"* ]] || [[ "$dmg" == *"arm64"* ]]; then
                arm64_dmg="$dmg"
            fi
        fi
    done
    
    cd ..
    
    # Get file information
    if [[ -n "$intel_dmg" ]]; then
        intel_info=$(get_file_info "dist/$intel_dmg" "$intel_dmg")
    fi
    
    if [[ -n "$arm64_dmg" ]]; then
        arm64_info=$(get_file_info "dist/$arm64_dmg" "$arm64_dmg")
    fi
    
    # Create the configuration file
    cat > "$config_file" << EOF
version: $VERSION
files:
$(if [[ -n "$intel_info" ]]; then
    echo "  - $intel_info" | sed 's/^/    /'
fi)
$(if [[ -n "$arm64_info" ]]; then
    echo "  - $arm64_info" | sed 's/^/    /'
fi)
path: ${intel_dmg:-$arm64_dmg}
$(if [[ -n "$intel_dmg" ]]; then
    get_file_info "dist/$intel_dmg" "$intel_dmg" | grep -E '^sha512:' | sed 's/url: .*//'
elif [[ -n "$arm64_dmg" ]]; then
    get_file_info "dist/$arm64_dmg" "$arm64_dmg" | grep -E '^sha512:' | sed 's/url: .*//'
fi)
releaseDate: '$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")'
EOF
    
    echo -e "${GREEN}✅ Created $config_file${NC}"
    
    # Copy to public directory
    cp "$config_file" "public/$config_file"
    echo -e "${GREEN}✅ Copied to public/$config_file${NC}"
}

# Function to create Windows/Linux auto-update configuration
create_windows_config() {
    echo -e "${YELLOW}🖥️  Creating Windows/Linux auto-update configuration...${NC}"
    
    local config_file="latest.yml"
    local windows_exe=""
    local linux_appimage=""
    local windows_info=""
    local linux_info=""
    
    # Find executable files in dist directory
    cd dist
    
    for file in *.exe *.AppImage; do
        if [[ -f "$file" ]]; then
            if [[ "$file" == *.exe ]]; then
                windows_exe="$file"
            elif [[ "$file" == *.AppImage ]]; then
                linux_appimage="$file"
            fi
        fi
    done
    
    cd ..
    
    # Get file information
    if [[ -n "$windows_exe" ]]; then
        windows_info=$(get_file_info "dist/$windows_exe" "$windows_exe")
    fi
    
    if [[ -n "$linux_appimage" ]]; then
        linux_info=$(get_file_info "dist/$linux_appimage" "$linux_appimage")
    fi
    
    # Create the configuration file
    cat > "$config_file" << EOF
version: $VERSION
files:
$(if [[ -n "$windows_info" ]]; then
    echo "  - $windows_info" | sed 's/^/    /'
fi)
$(if [[ -n "$linux_info" ]]; then
    echo "  - $linux_info" | sed 's/^/    /'
fi)
path: ${windows_exe:-$linux_appimage}
$(if [[ -n "$windows_exe" ]]; then
    get_file_info "dist/$windows_exe" "$windows_exe" | grep -E '^sha512:' | sed 's/url: .*//'
elif [[ -n "$linux_appimage" ]]; then
    get_file_info "dist/$linux_appimage" "$linux_appimage" | grep -E '^sha512:' | sed 's/url: .*//'
fi)
releaseDate: '$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")'
EOF
    
    echo -e "${GREEN}✅ Created $config_file${NC}"
    
    # Copy to public directory
    cp "$config_file" "public/$config_file"
    echo -e "${GREEN}✅ Copied to public/$config_file${NC}"
}

# Function to update app-update.yml for Electron auto-updater
create_app_update_config() {
    echo -e "${YELLOW}⚡ Creating app-update.yml for Electron auto-updater...${NC}"
    
    local config_file="public/app-update.yml"
    
    cat > "$config_file" << EOF
provider: github
owner: mafatah
repo: time-flow-admin
releaseType: release
updaterCacheDirName: timeflow-updater
EOF
    
    echo -e "${GREEN}✅ Created $config_file${NC}"
}

# Function to validate configuration files
validate_configs() {
    echo -e "${YELLOW}🔍 Validating configuration files...${NC}"
    
    local files=("latest.yml" "latest-mac.yml" "public/latest.yml" "public/latest-mac.yml")
    
    for file in "${files[@]}"; do
        if [[ -f "$file" ]]; then
            echo -e "${GREEN}✅ $file exists${NC}"
            
            # Basic validation
            if grep -q "version: $VERSION" "$file" && grep -q "sha512:" "$file"; then
                echo -e "${GREEN}   Content validation passed${NC}"
            else
                echo -e "${RED}   Content validation failed${NC}"
                return 1
            fi
        else
            echo -e "${RED}❌ $file not found${NC}"
            return 1
        fi
    done
}

# Function to create update server endpoint
create_update_endpoint() {
    echo -e "${YELLOW}🌐 Creating update server endpoint...${NC}"
    
    # Create update endpoint directory
    mkdir -p "public/api/updates"
    
    # Create update endpoint for macOS
    cat > "public/api/updates/darwin.json" << EOF
{
  "version": "$VERSION",
  "notes": "TimeFlow Desktop Application v$VERSION - Enhanced security and performance improvements",
  "pub_date": "$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")",
  "platforms": {
    "darwin-x64": {
      "signature": "",
      "url": "$BASE_URL/$(cd dist && ls *.dmg | grep -i intel | head -1)"
    },
    "darwin-arm64": {
      "signature": "", 
      "url": "$BASE_URL/$(cd dist && ls *.dmg | grep -i arm | head -1)"
    }
  }
}
EOF
    
    # Create update endpoint for Windows
    cat > "public/api/updates/win32.json" << EOF
{
  "version": "$VERSION",
  "notes": "TimeFlow Desktop Application v$VERSION - Enhanced security and performance improvements",
  "pub_date": "$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")",
  "platforms": {
    "win32-x64": {
      "signature": "",
      "url": "$BASE_URL/$(cd dist && ls *.exe | head -1)"
    }
  }
}
EOF
    
    echo -e "${GREEN}✅ Created update server endpoints${NC}"
}

# Main execution
main() {
    # Check if dist directory exists
    if [[ ! -d "dist" ]]; then
        echo -e "${RED}❌ dist directory not found. Please build the applications first.${NC}"
        exit 1
    fi
    
    # Check if there are any built files
    if ! ls dist/*.{dmg,exe,AppImage} >/dev/null 2>&1; then
        echo -e "${RED}❌ No built applications found in dist directory.${NC}"
        exit 1
    fi
    
    # Create public directory if it doesn't exist
    mkdir -p public
    
    # Create configuration files
    create_mac_config
    create_windows_config
    create_app_update_config
    create_update_endpoint
    
    # Validate configurations
    validate_configs
    
    echo ""
    echo -e "${GREEN}🎉 Auto-update configuration completed successfully!${NC}"
    echo ""
    echo -e "${BLUE}📋 Configuration Files Created:${NC}"
    echo "  • latest-mac.yml (macOS auto-update)"
    echo "  • latest.yml (Windows/Linux auto-update)"
    echo "  • public/latest-mac.yml (web server copy)"
    echo "  • public/latest.yml (web server copy)"
    echo "  • public/app-update.yml (Electron auto-updater)"
    echo "  • public/api/updates/darwin.json (macOS endpoint)"
    echo "  • public/api/updates/win32.json (Windows endpoint)"
    echo ""
    echo -e "${YELLOW}💡 Next steps:${NC}"
    echo "  1. Deploy the public directory to your web server"
    echo "  2. Update your application to check these endpoints"
    echo "  3. Test the auto-update functionality"
}

# Handle script arguments
case "${1:-}" in
    "mac-only")
        create_mac_config
        ;;
    "windows-only")
        create_windows_config
        ;;
    "validate-only")
        validate_configs
        ;;
    *)
        main
        ;;
esac 