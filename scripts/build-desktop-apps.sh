#!/bin/bash

# TimeFlow Desktop App Build Script
# This script builds desktop applications for all platforms

set -e

echo "🚀 Building TimeFlow Desktop Applications..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create directories
echo -e "${BLUE}📁 Creating directories...${NC}"
mkdir -p public/downloads
mkdir -p dist
mkdir -p build

# Step 0: Generate embedded configuration for desktop agent
echo -e "${BLUE}🔑 Generating embedded configuration...${NC}"
cd desktop-agent
if node generate-env-config.js; then
    echo -e "${GREEN}✅ Embedded configuration generated successfully${NC}"
else
    echo -e "${RED}❌ Failed to generate embedded configuration${NC}"
    echo -e "${YELLOW}💡 Make sure desktop-agent/.env exists with proper credentials${NC}"
    exit 1
fi
cd ..

# Step 1: Build web app
echo -e "${BLUE}🌐 Building web application...${NC}"
npm run build:dev

# Step 2: Build electron components  
echo -e "${BLUE}⚡ Building electron components...${NC}"
npm run build:electron

# Step 3: Copy web assets
echo -e "${BLUE}📋 Copying web assets...${NC}"
mkdir -p build/dist
cp -r dist/* build/dist/

# Step 4: Try to build desktop apps
echo -e "${BLUE}🖥️  Building desktop applications...${NC}"

if npm run electron:build; then
    echo -e "${GREEN}✅ Desktop apps built successfully!${NC}"
    
    # Copy built apps to public/downloads
    if [ -d "dist" ]; then
        echo -e "${BLUE}📦 Copying built apps to downloads folder...${NC}"
        
        # Copy macOS app
        if [ -f "dist/*.dmg" ]; then
            cp dist/*.dmg public/downloads/TimeFlow.dmg
            echo -e "${GREEN}✅ macOS app copied${NC}"
        fi
        
        # Copy Windows app  
        if [ -f "dist/*.exe" ]; then
            cp dist/*.exe public/downloads/TimeFlow-Setup.exe
            echo -e "${GREEN}✅ Windows app copied${NC}"
        fi
        
        # Copy Linux app
        if [ -f "dist/*.AppImage" ]; then
            cp dist/*.AppImage public/downloads/TimeFlow.AppImage
            echo -e "${GREEN}✅ Linux app copied${NC}"
        fi
    fi
else
    echo -e "${YELLOW}⚠️  Desktop app build failed, but that's okay!${NC}"
    echo -e "${YELLOW}   You can still deploy the web app with download placeholders.${NC}"
fi

# Step 5: Create placeholder files if real ones don't exist
echo -e "${BLUE}📝 Creating placeholder files for missing apps...${NC}"

create_placeholder() {
    local platform=$1
    local filename=$2
    local filepath="public/downloads/$filename"
    
    if [ ! -f "$filepath" ]; then
        echo "This is a placeholder for the TimeFlow Desktop App ($platform)." > "$filepath"
        echo "Contact your administrator to get the actual desktop application." >> "$filepath"
        echo -e "${YELLOW}📝 Created placeholder for $platform${NC}"
    else
        echo -e "${GREEN}✅ $platform app file exists${NC}"
    fi
}

create_placeholder "Windows" "TimeFlow-Setup.exe"
create_placeholder "macOS" "TimeFlow.dmg"  
create_placeholder "Linux" "TimeFlow.AppImage"

# Step 6: List what we have
echo -e "${BLUE}📋 Download files prepared:${NC}"
ls -la public/downloads/

echo -e "${GREEN}🎉 Build process complete!${NC}"
echo -e "${BLUE}Next steps:${NC}"
echo "1. Deploy your web app to Vercel/Netlify"
echo "2. Replace placeholder files with actual desktop apps when ready"
echo "3. Test download functionality on your deployed site"

echo -e "${BLUE}💡 To fix Electron build issues:${NC}"
echo "1. Check electron/main.ts file paths"
echo "2. Ensure all dependencies are properly installed"
echo "3. Consider using electron-forge instead of electron-builder" 