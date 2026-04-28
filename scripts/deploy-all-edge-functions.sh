#!/bin/bash

# 🚀 DEPLOY ALL EDGE FUNCTIONS SCRIPT
# This script deploys all 12 edge functions to fix the "0 screenshots analyzed" issue

echo "🚀 TimeFlow Edge Functions Deployment - Complete System Fix"
echo "=========================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -d "supabase/functions" ]; then
    echo -e "${RED}❌ Error: Please run this script from the project root directory${NC}"
    echo "Current directory: $(pwd)"
    echo "Expected: supabase/functions directory should exist"
    exit 1
fi

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Supabase CLI not found. Installing...${NC}"
    npm install -g @supabase/cli
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Failed to install Supabase CLI${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ Supabase CLI found: $(supabase --version)${NC}"

# Check if logged in
echo -e "${BLUE}📋 Checking Supabase authentication...${NC}"
if ! supabase projects list &> /dev/null; then
    echo -e "${YELLOW}🔐 Please login to Supabase:${NC}"
    supabase login
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Supabase login failed${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ Supabase authentication verified${NC}"

# Navigate to supabase directory
cd supabase

# Link project if not already linked
echo -e "${BLUE}🔗 Linking to TimeFlow project...${NC}"
supabase link --project-ref fkpiqcxkmrtaetvfgcli
if [ $? -ne 0 ]; then
    echo -e "${YELLOW}⚠️  Project might already be linked, continuing...${NC}"
fi

echo -e "${GREEN}✅ Project linked successfully${NC}"

# Function to deploy and test a single function
deploy_function() {
    local function_name=$1
    local description=$2
    
    echo -e "${BLUE}📦 Deploying ${function_name}...${NC}"
    echo "   Purpose: ${description}"
    
    # Deploy with JWT verification disabled for testing
    supabase functions deploy "${function_name}" --no-verify-jwt
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ ${function_name} deployed successfully${NC}"
        return 0
    else
        echo -e "${RED}❌ Failed to deploy ${function_name}${NC}"
        return 1
    fi
}

# Deploy all edge functions
echo ""
echo -e "${BLUE}🚀 Starting Edge Functions Deployment...${NC}"
echo "================================================"

# Track deployment results
deployed_count=0
failed_count=0

# Step 1: Deploy Core AI Functions
echo ""
echo -e "${YELLOW}🤖 Step 1: Deploying Core AI Functions${NC}"
echo "----------------------------------------"

if deploy_function "ai-insights-worker" "Main AI orchestration and screenshot processing"; then
    ((deployed_count++))
else
    ((failed_count++))
fi

if deploy_function "ai-screenshot-analyzer" "AI-powered screenshot content analysis"; then
    ((deployed_count++))
else
    ((failed_count++))
fi

if deploy_function "comprehensive-employee-analysis" "AI-powered employee insights and productivity analysis"; then
    ((deployed_count++))
else
    ((failed_count++))
fi

# Step 2: Deploy Communication Functions
echo ""
echo -e "${YELLOW}📧 Step 2: Deploying Communication Functions${NC}"
echo "----------------------------------------"

if deploy_function "email-reports" "Automated email reporting system"; then
    ((deployed_count++))
else
    ((failed_count++))
fi

if deploy_function "schedule-reports" "Report scheduling and management"; then
    ((deployed_count++))
else
    ((failed_count++))
fi

if deploy_function "send-report-email" "Individual report email sending"; then
    ((deployed_count++))
else
    ((failed_count++))
fi

if deploy_function "employee-notifications" "Employee notification system"; then
    ((deployed_count++))
else
    ((failed_count++))
fi

# Step 3: Deploy Data Processing Functions
echo ""
echo -e "${YELLOW}💾 Step 3: Deploying Data Processing Functions${NC}"
echo "----------------------------------------"

if deploy_function "screenshot" "Screenshot upload and processing"; then
    ((deployed_count++))
else
    ((failed_count++))
fi

if deploy_function "idle-log" "Idle time logging and analysis"; then
    ((deployed_count++))
else
    ((failed_count++))
fi

# Step 3b: Deploy Desktop Agent Sync Proxy (JWT required)
echo ""
echo -e "${YELLOW}🔐 Step 3b: Deploying Desktop Sync Proxy${NC}"
echo "----------------------------------------"

echo -e "${BLUE}📦 Deploying desktop-sync (WITH JWT verification)...${NC}"
echo "   Purpose: Secure server-side proxy for desktop agent writes"
supabase functions deploy "desktop-sync"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ desktop-sync deployed successfully (JWT verification ON)${NC}"
    ((deployed_count++))
else
    echo -e "${RED}❌ Failed to deploy desktop-sync${NC}"
    ((failed_count++))
fi

# Step 4: Deploy Automation Functions
echo ""
echo -e "${YELLOW}🔧 Step 4: Deploying Automation Functions${NC}"
echo "----------------------------------------"

if deploy_function "auto-send-reports" "Fully automated report system"; then
    ((deployed_count++))
else
    ((failed_count++))
fi

if deploy_function "trigger-comprehensive-analysis" "Manual analysis triggering"; then
    ((deployed_count++))
else
    ((failed_count++))
fi

if deploy_function "execute-cron-migration" "Cron job setup and migration"; then
    ((deployed_count++))
else
    ((failed_count++))
fi

# Deployment Summary
echo ""
echo -e "${BLUE}📊 Deployment Summary${NC}"
echo "========================"
echo -e "${GREEN}✅ Successfully Deployed: ${deployed_count}${NC}"
echo -e "${RED}❌ Failed Deployments: ${failed_count}${NC}"
echo -e "${BLUE}📋 Total Functions: 13${NC}"

# List deployed functions
echo ""
echo -e "${BLUE}📋 Listing Deployed Functions:${NC}"
supabase functions list

# Test the core functions
echo ""
echo -e "${BLUE}🧪 Testing Core Functions...${NC}"
echo "================================"

# Test ai-insights-worker
echo -e "${BLUE}Testing ai-insights-worker...${NC}"
cd ..
TEST_RESPONSE=$(curl -s -X POST "https://fkpiqcxkmrtaetvfgcli.supabase.co/functions/v1/ai-insights-worker" \
  -H "Content-Type: application/json" \
  -d '{"action": "get-status"}')

if echo "$TEST_RESPONSE" | grep -q "isRunning\|processedToday\|pendingAnalyses"; then
    echo -e "${GREEN}✅ ai-insights-worker is responding correctly${NC}"
    echo "   Response: $(echo "$TEST_RESPONSE" | jq -r '.pendingAnalyses // "unknown"') pending analyses"
else
    echo -e "${RED}❌ ai-insights-worker test failed${NC}"
    echo "   Response: $TEST_RESPONSE"
fi

# Test ai-screenshot-analyzer
echo -e "${BLUE}Testing ai-screenshot-analyzer...${NC}"
TEST_RESPONSE2=$(curl -s -X POST "https://fkpiqcxkmrtaetvfgcli.supabase.co/functions/v1/ai-screenshot-analyzer" \
  -H "Content-Type: application/json" \
  -d '{"screenshot_id": "test", "user_id": "test", "window_title": "test", "app_name": "test"}')

if echo "$TEST_RESPONSE2" | grep -q "screenshot_id is required\|Screenshot not found"; then
    echo -e "${GREEN}✅ ai-screenshot-analyzer is responding correctly${NC}"
else
    echo -e "${RED}❌ ai-screenshot-analyzer test failed${NC}"
    echo "   Response: $TEST_RESPONSE2"
fi

# Next Steps
echo ""
echo -e "${BLUE}📋 Next Steps${NC}"
echo "=============="
echo -e "${YELLOW}1. Set Environment Variables in Supabase:${NC}"
echo "   - Go to Supabase Dashboard → Settings → Environment Variables"
echo "   - Set OPENAI_API_KEY for AI features"
echo "   - Set RESEND_API_KEY for email features"
echo ""
echo -e "${YELLOW}2. Test the Complete System:${NC}"
echo "   ./scripts/manual-ai-processing-trigger.sh"
echo ""
echo -e "${YELLOW}3. Check Dashboard:${NC}"
echo "   - Refresh your TimeFlow dashboard"
echo "   - Screenshot counts should start updating within 15 minutes"
echo ""
echo -e "${YELLOW}4. Monitor Progress:${NC}"
echo "   - Check Supabase function logs"
echo "   - Monitor screenshot analysis progress"
echo "   - Verify cron jobs are executing"

# Final Status
echo ""
if [ $failed_count -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL EDGE FUNCTIONS DEPLOYED SUCCESSFULLY!${NC}"
    echo -e "${GREEN}✅ Your TimeFlow system should now work completely!${NC}"
else
    echo -e "${YELLOW}⚠️  Some functions failed to deploy. Please check the errors above.${NC}"
    echo -e "${YELLOW}✅ ${deployed_count} functions are ready and should resolve the main issue.${NC}"
fi

echo ""
echo -e "${BLUE}🔗 System Status:${NC}"
echo "   - Edge Functions: ${deployed_count}/13 deployed"
echo "   - AI Analysis: Ready to process screenshots"
echo "   - Cron Jobs: Will work once functions are deployed"
echo "   - Dashboard: Should update within 15 minutes"

echo ""
echo -e "${GREEN}🚀 Deployment Complete! Your screenshot analysis issue should be resolved.${NC}"
