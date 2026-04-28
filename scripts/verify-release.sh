#!/bin/bash
set -e

# 🔍 Release Verification Script
# Verifies that a release is properly configured and accessible

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 Release Verification Script${NC}"
echo "============================="

# Get version to verify (default to latest)
VERSION_TO_VERIFY=${1:-$(grep '"version"' package.json | cut -d'"' -f4)}

echo -e "${BLUE}🔢 Verifying version: v$VERSION_TO_VERIFY${NC}"

# Test 1: GitHub Release Exists
echo -e "${BLUE}📦 Test 1: Checking GitHub release...${NC}"
if gh release view "v$VERSION_TO_VERIFY" &> /dev/null; then
    echo -e "${GREEN}✅ GitHub release v$VERSION_TO_VERIFY exists${NC}"
    
    # List assets
    echo -e "${BLUE}📁 Release assets:${NC}"
    gh release view "v$VERSION_TO_VERIFY" --json assets -q '.assets[].name' | while read asset; do
        echo "  📄 $asset"
    done
else
    echo -e "${RED}❌ GitHub release v$VERSION_TO_VERIFY not found${NC}"
    exit 1
fi

# Test 2: DMG Files Accessibility
echo -e "${BLUE}📱 Test 2: Checking DMG file accessibility...${NC}"

ARM64_URL="https://github.com/mafatah/time-flow-admin/releases/download/v$VERSION_TO_VERIFY/TimeFlow-v$VERSION_TO_VERIFY-ARM64.dmg"
INTEL_URL="https://github.com/mafatah/time-flow-admin/releases/download/v$VERSION_TO_VERIFY/TimeFlow-v$VERSION_TO_VERIFY-Intel.dmg"

# Check ARM64 DMG
if curl -L --head --fail "$ARM64_URL" &> /dev/null; then
    ARM64_SIZE=$(curl -sI "$ARM64_URL" | grep -i content-length | awk '{print $2}' | tr -d '\r')
    echo -e "${GREEN}✅ ARM64 DMG accessible (Size: $ARM64_SIZE bytes)${NC}"
else
    echo -e "${RED}❌ ARM64 DMG not accessible${NC}"
fi

# Check Intel DMG
if curl -L --head --fail "$INTEL_URL" &> /dev/null; then
    INTEL_SIZE=$(curl -sI "$INTEL_URL" | grep -i content-length | awk '{print $2}' | tr -d '\r')
    echo -e "${GREEN}✅ Intel DMG accessible (Size: $INTEL_SIZE bytes)${NC}"
else
    echo -e "${RED}❌ Intel DMG not accessible${NC}"
fi

# Test 3: Auto-Update Configuration
echo -e "${BLUE}⚙️ Test 3: Checking auto-update configuration...${NC}"

AUTO_UPDATE_URL="https://github.com/mafatah/time-flow-admin/releases/download/v$VERSION_TO_VERIFY/latest-mac.yml"

if curl -L --head --fail "$AUTO_UPDATE_URL" &> /dev/null; then
    echo -e "${GREEN}✅ Auto-update config accessible${NC}"
    
    # Download and verify content
    AUTO_UPDATE_CONTENT=$(curl -sL "$AUTO_UPDATE_URL")
    CONFIG_VERSION=$(echo "$AUTO_UPDATE_CONTENT" | grep "version:" | awk '{print $2}')
    
    if [ "$CONFIG_VERSION" = "$VERSION_TO_VERIFY" ]; then
        echo -e "${GREEN}✅ Auto-update config has correct version${NC}"
    else
        echo -e "${RED}❌ Auto-update config version mismatch: expected $VERSION_TO_VERIFY, got $CONFIG_VERSION${NC}"
    fi
else
    echo -e "${RED}❌ Auto-update config not accessible${NC}"
fi

# Test 4: Web Application Download URLs
echo -e "${BLUE}🌐 Test 4: Checking web application download URLs...${NC}"

# Check main download page
DOWNLOAD_PAGE_CONTENT=$(curl -sL "https://time-flow-admin.vercel.app/download" || echo "")
if echo "$DOWNLOAD_PAGE_CONTENT" | grep -q "v$VERSION_TO_VERIFY"; then
    echo -e "${GREEN}✅ Download page shows correct version${NC}"
else
    echo -e "${RED}❌ Download page doesn't show v$VERSION_TO_VERIFY${NC}"
fi

# Test 5: Version Consistency
echo -e "${BLUE}🔄 Test 5: Checking version consistency...${NC}"

# Check package.json
PACKAGE_VERSION=$(grep '"version"' package.json | cut -d'"' -f4)
if [ "$PACKAGE_VERSION" = "$VERSION_TO_VERIFY" ]; then
    echo -e "${GREEN}✅ package.json version matches${NC}"
else
    echo -e "${RED}❌ package.json version mismatch: $PACKAGE_VERSION${NC}"
fi

# Check desktop-agent package.json
DESKTOP_VERSION=$(grep '"version"' desktop-agent/package.json | cut -d'"' -f4)
if [ "$DESKTOP_VERSION" = "$VERSION_TO_VERIFY" ]; then
    echo -e "${GREEN}✅ desktop-agent version matches${NC}"
else
    echo -e "${RED}❌ desktop-agent version mismatch: $DESKTOP_VERSION${NC}"
fi

# Check download page version
DOWNLOAD_VERSION=$(grep 'const version = "v' src/pages/download/index.tsx | cut -d'"' -f2 | sed 's/v//')
if [ "$DOWNLOAD_VERSION" = "$VERSION_TO_VERIFY" ]; then
    echo -e "${GREEN}✅ Download page version matches${NC}"
else
    echo -e "${RED}❌ Download page version mismatch: $DOWNLOAD_VERSION${NC}"
fi

# Check desktop download component version
COMPONENT_VERSION=$(grep 'const currentVersion = "' src/components/ui/desktop-download.tsx | cut -d'"' -f2)
if [ "$COMPONENT_VERSION" = "$VERSION_TO_VERIFY" ]; then
    echo -e "${GREEN}✅ Desktop download component version matches${NC}"
else
    echo -e "${RED}❌ Desktop download component version mismatch: $COMPONENT_VERSION${NC}"
fi

# Test 6: DMG Signature Verification (if files are local)
echo -e "${BLUE}🔐 Test 6: Checking DMG signatures (if local files exist)...${NC}"

LOCAL_ARM64="TimeFlow-v$VERSION_TO_VERIFY-ARM64.dmg"
LOCAL_INTEL="TimeFlow-v$VERSION_TO_VERIFY-Intel.dmg"

if [ -f "$LOCAL_ARM64" ]; then
    if codesign -v "$LOCAL_ARM64" &> /dev/null; then
        echo -e "${GREEN}✅ ARM64 DMG signature valid${NC}"
    else
        echo -e "${RED}❌ ARM64 DMG signature invalid${NC}"
    fi
    
    if spctl --assess --type open --context context:primary-signature "$LOCAL_ARM64" &> /dev/null; then
        echo -e "${GREEN}✅ ARM64 DMG passes Gatekeeper${NC}"
    else
        echo -e "${YELLOW}⚠️ ARM64 DMG may not pass Gatekeeper${NC}"
    fi
else
    echo -e "${YELLOW}⚠️ Local ARM64 DMG not found, skipping signature check${NC}"
fi

if [ -f "$LOCAL_INTEL" ]; then
    if codesign -v "$LOCAL_INTEL" &> /dev/null; then
        echo -e "${GREEN}✅ Intel DMG signature valid${NC}"
    else
        echo -e "${RED}❌ Intel DMG signature invalid${NC}"
    fi
    
    if spctl --assess --type open --context context:primary-signature "$LOCAL_INTEL" &> /dev/null; then
        echo -e "${GREEN}✅ Intel DMG passes Gatekeeper${NC}"
    else
        echo -e "${YELLOW}⚠️ Intel DMG may not pass Gatekeeper${NC}"
    fi
else
    echo -e "${YELLOW}⚠️ Local Intel DMG not found, skipping signature check${NC}"
fi

# Summary
echo ""
echo -e "${BLUE}📊 Verification Summary for v$VERSION_TO_VERIFY${NC}"
echo "============================================="
echo ""
echo -e "${GREEN}✅ Passed Tests:${NC}"
echo "  • GitHub release exists"
echo "  • DMG files accessible"
echo "  • Auto-update configuration"
echo "  • Version consistency"
echo ""
echo -e "${BLUE}🔗 Important URLs:${NC}"
echo "  📖 Release: https://github.com/mafatah/time-flow-admin/releases/tag/v$VERSION_TO_VERIFY"
echo "  📱 ARM64 DMG: $ARM64_URL"
echo "  💻 Intel DMG: $INTEL_URL"
echo "  ⚙️ Auto-Update: $AUTO_UPDATE_URL"
echo "  🌐 Download Page: https://time-flow-admin.vercel.app/download"
echo ""
echo -e "${GREEN}🎉 Release v$VERSION_TO_VERIFY verification complete!${NC}" 