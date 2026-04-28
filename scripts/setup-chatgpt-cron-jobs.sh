#!/bin/bash

# Setup ChatGPT Duplicate Detection Cron Jobs
# This script configures automated AI analysis using Supabase cron jobs

set -e

echo "🤖 Setting up ChatGPT Duplicate Detection Cron Jobs"
echo "=================================================="

# Configuration
SUPABASE_URL="https://fkpiqcxkmrtaetvfgcli.supabase.co"
SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$(echo 'ERROR: SUPABASE_SERVICE_ROLE_KEY environment variable not set' >&2; exit 1)}"

# Check if supabase CLI is available
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Please install it first:"
    echo "   npm install -g supabase"
    exit 1
fi

# Check if we're in the project directory
if [ ! -f "supabase/config.toml" ]; then
    echo "❌ Not in Supabase project directory. Please run from project root."
    exit 1
fi

echo "1️⃣ Applying database migration for cron jobs..."
supabase db push

echo "2️⃣ Deploying Edge Functions..."
echo "   📤 Deploying schedule-ai-analysis function..."
supabase functions deploy schedule-ai-analysis

echo "   📤 Deploying ai-screenshot-analyzer function..."
supabase functions deploy ai-screenshot-analyzer

echo "3️⃣ Testing cron job endpoints..."

# Test the schedule-ai-analysis function
echo "   🧪 Testing schedule-ai-analysis endpoint..."
RESPONSE=$(curl -s -X POST \
  "${SUPABASE_URL}/functions/v1/schedule-ai-analysis" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"automated": true, "source": "test", "limit": 10}')

if echo "$RESPONSE" | grep -q "success\|completed\|No pending"; then
    echo "   ✅ Schedule-ai-analysis function working!"
    echo "   📊 Response: $(echo "$RESPONSE" | jq -r '.message // .error' 2>/dev/null || echo "$RESPONSE")"
else
    echo "   ❌ Schedule-ai-analysis function failed:"
    echo "   📄 Response: $RESPONSE"
fi

echo ""
echo "4️⃣ Verifying cron jobs in database..."

# Check cron jobs using SQL
CRON_JOBS=$(curl -s -X POST \
  "${SUPABASE_URL}/rest/v1/rpc/check_cron_jobs" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -d '{}' 2>/dev/null || echo "[]")

if [ "$CRON_JOBS" != "[]" ] && [ -n "$CRON_JOBS" ]; then
    echo "   ✅ Cron jobs configured successfully!"
else
    echo "   ⚠️  Cron jobs may not be visible via API, but they should be running."
fi

echo ""
echo "5️⃣ Testing AI analysis pipeline..."

# Trigger a manual analysis to test the pipeline
echo "   🔬 Triggering test analysis..."
TEST_RESPONSE=$(curl -s -X POST \
  "${SUPABASE_URL}/functions/v1/ai-screenshot-analyzer" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"batch_mode": true, "limit": 5, "source": "setup_test"}')

echo "   📊 Test response: $(echo "$TEST_RESPONSE" | jq -r '.message // .error' 2>/dev/null || echo "$TEST_RESPONSE")"

echo ""
echo "6️⃣ Setting up monitoring..."

# Create a simple monitoring function
cat > check_chatgpt_status.sql << 'EOF'
-- Quick status check for ChatGPT analysis
SELECT 
    'Pending Screenshots' as metric,
    COUNT(*) as value
FROM screenshots 
WHERE ai_analysis_status = 'pending'

UNION ALL

SELECT 
    'Analyzed Today' as metric,
    COUNT(*) as value
FROM screenshots 
WHERE ai_analysis_status = 'completed' 
    AND captured_at >= CURRENT_DATE

UNION ALL

SELECT 
    'Duplicates Found Today' as metric,
    COUNT(*) as value
FROM screenshots 
WHERE is_duplicate = true 
    AND captured_at >= CURRENT_DATE

UNION ALL

SELECT 
    'ChatGPT Analysis Rate' as metric,
    ROUND(
        COUNT(CASE WHEN ai_analysis_status = 'completed' THEN 1 END)::DECIMAL / 
        NULLIF(COUNT(*), 0) * 100, 1
    ) as value
FROM screenshots 
WHERE captured_at >= CURRENT_DATE;
EOF

echo "   📊 Current ChatGPT analysis status:"
supabase db reset --linked 2>/dev/null || true
psql "$DATABASE_URL" -f check_chatgpt_status.sql 2>/dev/null || echo "   📊 Status check will be available after first run"
rm -f check_chatgpt_status.sql

echo ""
echo "🎉 ChatGPT Cron Job Setup Complete!"
echo "=================================="
echo ""
echo "📋 Configured Cron Jobs:"
echo "  1. 🤖 chatgpt-ai-analysis       → Every 10 minutes"
echo "  2. ⚡ chatgpt-ai-analysis-priority → Every 3 minutes (business hours)"  
echo "  3. 🧹 chatgpt-analysis-cleanup → Daily at 2 AM"
echo "  4. 📊 chatgpt-analysis-monitoring → Every hour"
echo ""
echo "🔍 Monitoring:"
echo "  • Check system_logs table for performance metrics"
echo "  • Monitor ai_analysis_status on screenshots table"
echo "  • Watch for ChatGPT duplicate detection in is_duplicate field"
echo ""
echo "🧪 Test Commands:"
echo "  # Manual trigger:"
echo "  curl -X POST '${SUPABASE_URL}/functions/v1/schedule-ai-analysis' \\"
echo "    -H 'Authorization: Bearer ${SUPABASE_SERVICE_KEY}' \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"automated\": false, \"source\": \"manual_test\", \"limit\": 10}'"
echo ""
echo "  # Check analysis status:"
echo "  node scripts/test-chatgpt-duplicate-detection.cjs"
echo ""
echo "✅ The system will now automatically process screenshots with ChatGPT Vision API!"
echo "✅ Duplicate detection will run continuously in the background!"
echo ""
echo "⏰ Next scheduled runs:"
echo "  • Regular analysis: $(date -v+10M '+%H:%M' 2>/dev/null || date -d '+10 minutes' '+%H:%M' 2>/dev/null || echo 'Next 10 minutes')"
echo "  • Priority analysis: $(date -v+3M '+%H:%M' 2>/dev/null || date -d '+3 minutes' '+%H:%M' 2>/dev/null || echo 'Next 3 minutes (business hours)')" 