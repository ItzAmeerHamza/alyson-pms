#!/bin/bash
set -e

# 🔐 DMG Notarization Helper Script
# For notarizing individual DMG files

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔐 DMG Notarization Helper${NC}"
echo "========================="

# Configuration - USE ENVIRONMENT VARIABLES (set these before running)
APPLE_ID="${APPLE_ID}"
APP_PASSWORD="${APPLE_APP_SPECIFIC_PASSWORD}"
TEAM_ID="${APPLE_TEAM_ID}"

# Check if DMG file is provided
if [ $# -eq 0 ]; then
    echo -e "${RED}❌ Error: Please provide a DMG file to notarize${NC}"
    echo "Usage: $0 <path-to-dmg-file>"
    exit 1
fi

DMG_FILE="$1"

# Check if file exists
if [ ! -f "$DMG_FILE" ]; then
    echo -e "${RED}❌ Error: File not found: $DMG_FILE${NC}"
    exit 1
fi

echo -e "${BLUE}📁 DMG File: $DMG_FILE${NC}"

# Step 1: Submit for notarization
echo -e "${BLUE}📤 Step 1: Submitting for notarization...${NC}"

SUBMIT_OUTPUT=$(xcrun notarytool submit "$DMG_FILE" \
    --apple-id "$APPLE_ID" \
    --password "$APP_PASSWORD" \
    --team-id "$TEAM_ID" \
    --wait 2>&1)

echo "$SUBMIT_OUTPUT"

# Extract submission ID
SUBMISSION_ID=$(echo "$SUBMIT_OUTPUT" | grep "id:" | head -1 | awk '{print $2}')

if [ -z "$SUBMISSION_ID" ]; then
    echo -e "${RED}❌ Failed to get submission ID${NC}"
    exit 1
fi

echo -e "${BLUE}🆔 Submission ID: $SUBMISSION_ID${NC}"

# Step 2: Check notarization status
echo -e "${BLUE}🔍 Step 2: Checking notarization status...${NC}"

# Wait for notarization to complete
while true; do
    STATUS_OUTPUT=$(xcrun notarytool info "$SUBMISSION_ID" \
        --apple-id "$APPLE_ID" \
        --password "$APP_PASSWORD" \
        --team-id "$TEAM_ID" 2>&1)
    
    STATUS=$(echo "$STATUS_OUTPUT" | grep "status:" | awk '{print $2}')
    
    echo -e "${BLUE}📊 Current status: $STATUS${NC}"
    
    if [ "$STATUS" = "Accepted" ]; then
        echo -e "${GREEN}✅ Notarization successful!${NC}"
        break
    elif [ "$STATUS" = "Invalid" ]; then
        echo -e "${RED}❌ Notarization failed!${NC}"
        echo "$STATUS_OUTPUT"
        exit 1
    else
        echo -e "${YELLOW}⏳ Waiting for notarization to complete...${NC}"
        sleep 30
    fi
done

# Step 3: Staple the notarization
echo -e "${BLUE}📎 Step 3: Stapling notarization...${NC}"

if xcrun stapler staple "$DMG_FILE"; then
    echo -e "${GREEN}✅ Notarization stapled successfully!${NC}"
else
    echo -e "${YELLOW}⚠️ Stapling failed, but notarization was successful${NC}"
fi

# Step 4: Verify notarization
echo -e "${BLUE}🔍 Step 4: Verifying notarization...${NC}"

if xcrun stapler validate "$DMG_FILE"; then
    echo -e "${GREEN}✅ DMG is properly notarized and stapled!${NC}"
else
    echo -e "${YELLOW}⚠️ Stapler validation failed, checking spctl...${NC}"
    
    # Alternative verification using spctl
    if spctl --assess --type open --context context:primary-signature "$DMG_FILE"; then
        echo -e "${GREEN}✅ DMG passes Gatekeeper assessment!${NC}"
    else
        echo -e "${RED}❌ DMG failed Gatekeeper assessment${NC}"
    fi
fi

echo ""
echo -e "${GREEN}🎉 Notarization process complete!${NC}"
echo -e "${BLUE}📁 File: $DMG_FILE${NC}"
echo -e "${BLUE}🆔 Submission ID: $SUBMISSION_ID${NC}" 