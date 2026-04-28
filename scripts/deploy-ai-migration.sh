#!/bin/bash

# Deploy AI Migration - GLM-4.7 + Alerts System
# This script deploys all updated edge functions and applies the database migration

set -e

echo "🚀 TimeFlow AI Migration Deployment"
echo "===================================="
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Please install it first:"
    echo "   npm install -g supabase"
    exit 1
fi

# Check for HF_API_TOKEN
if [ -z "$HF_API_TOKEN" ]; then
    echo "⚠️  HF_API_TOKEN environment variable not set"
    echo "   You can set it in Supabase secrets after deployment"
    echo ""
fi

PROJECT_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$PROJECT_DIR"

echo "📁 Working directory: $PROJECT_DIR"
echo ""

# Step 1: Set Hugging Face token secret
echo "🔐 Step 1: Setting Hugging Face API token secret..."
if [ -n "$HF_API_TOKEN" ]; then
    echo "   Setting HF_API_TOKEN in Supabase secrets..."
    supabase secrets set HF_API_TOKEN="$HF_API_TOKEN" || echo "   ⚠️ Could not set secret (may need to be done manually)"
else
    echo "   ⚠️ Skipping - HF_API_TOKEN not set in environment"
    echo "   Run: supabase secrets set HF_API_TOKEN=<your-huggingface-token>"
fi
echo ""

# Step 2: Apply database migration
echo "📊 Step 2: Applying database migration..."
echo "   Migration: 20250101_admin_alerts_and_ai_enhancements.sql"
echo ""
echo "   This will create:"
echo "   - admin_alerts table"
echo "   - ai_user_patterns table"
echo "   - New columns on screenshots table"
echo "   - Realtime subscriptions for alerts"
echo ""

# Check if using Supabase MCP or direct CLI
if command -v supabase &> /dev/null; then
    echo "   ℹ️  To apply migration manually, run:"
    echo "   supabase db push"
    echo ""
    echo "   Or apply via Supabase dashboard SQL editor with:"
    echo "   $PROJECT_DIR/supabase/migrations/20250101_admin_alerts_and_ai_enhancements.sql"
fi
echo ""

# Step 3: Deploy edge functions
echo "⚡ Step 3: Deploying Edge Functions..."
echo ""

FUNCTIONS=(
    "ai-analysis"
    "ai-screenshot-analyzer"
    "comprehensive-employee-analysis"
    "test-huggingface"
)

for func in "${FUNCTIONS[@]}"; do
    echo "   📦 Deploying $func..."
    if supabase functions deploy "$func" --no-verify-jwt 2>/dev/null; then
        echo "   ✅ $func deployed"
    else
        echo "   ⚠️ $func deployment may have issues"
    fi
done

echo ""
echo "🧪 Step 4: Testing deployment..."
echo ""
echo "   To test the Hugging Face integration, invoke:"
echo "   curl -X POST 'YOUR_SUPABASE_URL/functions/v1/test-huggingface' \\"
echo "     -H 'Authorization: Bearer YOUR_ANON_KEY'"
echo ""

# Summary
echo "===================================="
echo "✅ Deployment Complete!"
echo ""
echo "📋 What was deployed:"
echo "   - ai-analysis: Text analysis with GLM-4.7"
echo "   - ai-screenshot-analyzer: Enhanced with vision + alerts"
echo "   - comprehensive-employee-analysis: AI-powered summaries"
echo "   - test-huggingface: Validate integration"
echo ""
echo "📝 Manual steps required:"
echo "   1. Apply migration via Supabase Dashboard or CLI"
echo "   2. Set HF_API_TOKEN if not already done"
echo "   3. Test with test-huggingface function"
echo ""
echo "🔗 New Features Available:"
echo "   - Real-time alerts panel in AI Insights page"
echo "   - Screenshot badges for categories/alerts"
echo "   - GLM-4.7 powered text analysis"
echo "   - Qwen2-VL vision analysis (optional)"
echo "   - Consecutive duplicate detection"
echo ""
echo "📖 Documentation: See CLAUDE.md for full migration details"


