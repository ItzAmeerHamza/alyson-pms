#!/bin/bash
# Complete Vercel Environment Setup Script

echo "🔧 Completing Vercel Environment Variables Setup"
echo "================================================"
echo ""

# Function to safely add environment variables
add_env_var() {
    local name=$1
    local value=$2
    local env=$3
    
    echo "📝 Adding $name to $env environment..."
    echo "$value" | vercel env add "$name" "$env" 2>/dev/null || {
        echo "⚠️  Variable $name might already exist for $env"
        return 1
    }
    echo "✅ Successfully added $name to $env"
    return 0
}

# Development Database Credentials - SET THESE FROM ENVIRONMENT VARIABLES
DEV_SUPABASE_URL="${DEV_SUPABASE_URL:-[SET_DEV_SUPABASE_URL]}"
DEV_SUPABASE_ANON_KEY="${DEV_SUPABASE_ANON_KEY:-[SET_DEV_ANON_KEY]}"

# Production Database Credentials - SET THESE FROM ENVIRONMENT VARIABLES
PROD_SUPABASE_URL="${PROD_SUPABASE_URL:-[SET_PROD_SUPABASE_URL]}"
PROD_SUPABASE_ANON_KEY="${PROD_SUPABASE_ANON_KEY:-[SET_PROD_ANON_KEY]}"

echo "🔄 Adding Production Environment Variables..."
add_env_var "VITE_SUPABASE_URL" "$PROD_SUPABASE_URL" "production"
add_env_var "VITE_SUPABASE_ANON_KEY" "$PROD_SUPABASE_ANON_KEY" "production"
add_env_var "VITE_ENVIRONMENT" "production" "production"
add_env_var "VITE_DEBUG_MODE" "false" "production"

echo ""
echo "🛠️  Adding Development Environment Variables..."
# Note: Development URL already added
add_env_var "VITE_SUPABASE_ANON_KEY" "$DEV_SUPABASE_ANON_KEY" "development"
add_env_var "VITE_ENVIRONMENT" "development" "development"
add_env_var "VITE_DEBUG_MODE" "true" "development"

echo ""
echo "🚀 Triggering deployments to apply new environment variables..."
echo ""

# Trigger redeployment
echo "📦 Redeploying development branch..."
git checkout development 2>/dev/null || git checkout -b development
vercel --prod=false --confirm 2>/dev/null || echo "⚠️  Development deployment may need manual trigger"

echo ""
echo "📦 Redeploying production branch..."
git checkout main 2>/dev/null
vercel --prod --confirm 2>/dev/null || echo "⚠️  Production deployment may need manual trigger"

echo ""
echo "✅ Environment Variables Setup Complete!"
echo ""
echo "🌐 URLs:"
echo "  Production:  https://worktime.ebdaadt.com"
echo "  Development: https://time-flow-admin-git-development-m-afatah-hotmailcoms-projects.vercel.app"
echo ""
echo "🔧 Each environment now uses its own database:"
# ⚠️  WARNING: Update the hardcoded database URLs in the echo statements below
#     These should also use environment variables for full security
echo "  Production:  fkpiqcxkmrtaetvfgcli.supabase.co"
echo "  Development: clypxuffvpqgmczbsblj.supabase.co"
echo "" 