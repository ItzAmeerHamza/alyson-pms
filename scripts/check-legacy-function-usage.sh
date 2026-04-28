#!/bin/bash

# Check Legacy Edge Function Usage
# This script checks if the old edge functions are referenced anywhere

echo "🔍 Checking Legacy Edge Function Usage"
echo "======================================"

# Supabase configuration
SUPABASE_URL="https://fkpiqcxkmrtaetvfgcli.supabase.co"
SUPABASE_ANON_KEY="***KEY_REMOVED***"

echo "📊 Step 1: Check if legacy functions are referenced in cron jobs..."
echo "Querying cron.job table for legacy function references..."

# Create a temporary SQL file to check references
cat > /tmp/check_legacy_usage.sql << 'EOF'
-- Check for legacy edge function references
-- Run this in Supabase Dashboard → SQL Editor

-- Check cron jobs for legacy function references
SELECT 
    'cron.job' as table_name,
    jobname,
    command,
    'Legacy function reference found' as status
FROM cron.job 
WHERE command LIKE '%idle-log%' 
   OR command LIKE '%schedule-reports%'
   OR command LIKE '%send-report-email%'
   OR command LIKE '%email-reports%'
   OR command LIKE '%employee-notifications%';

-- Check if any tables reference these functions
SELECT 
    'database functions' as table_name,
    'Check for stored procedures/functions' as status,
    'Manual verification needed' as details;

-- Check for any API calls or webhook references
SELECT 
    'external references' as table_name,
    'Check for webhook configurations' as status,
    'Manual verification needed' as details;
EOF

echo "📝 SQL script created: /tmp/check_legacy_usage.sql"
echo ""

echo "📊 Step 2: Check current cron job status..."
echo "Current active cron jobs:"

# Check current cron jobs
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/check_cron_jobs" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' 2>/dev/null || echo "Direct RPC call failed, use SQL Editor instead"

echo ""
echo "📊 Step 3: Manual verification steps..."
echo "======================================"
echo "1. Go to Supabase Dashboard → SQL Editor"
echo "2. Run the SQL from: /tmp/check_legacy_usage.sql"
echo "3. Check results for any legacy function references"
echo ""
echo "4. Also check these locations manually:"
echo "   - Edge Functions → Check if any are being called"
echo "   - Database → Check for stored procedures"
echo "   - API → Check for webhook configurations"
echo "   - Cron Jobs → Verify no old references remain"
echo ""

echo "📊 Step 4: If no references found, safe to remove..."
echo "Legacy functions to check:"
echo "  - idle-log (⚠️ OLD - 01 Jan, 1970)"
echo "  - schedule-reports (⚠️ OLD - 01 Jan, 1970)"
echo "  - send-report-email (⚠️ OLD - 01 Jan, 1970)"
echo "  - email-reports (⚠️ OLD - 01 Jan, 2025)"
echo "  - employee-notifications (⚠️ OLD - 13 Jul, 2025)"
echo ""

echo "🎯 Analysis Complete!"
echo "====================="
echo "Run the SQL script in Supabase to check for references"
echo "If none found, these legacy functions can be safely removed"
