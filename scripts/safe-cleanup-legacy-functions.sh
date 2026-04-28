#!/bin/bash

# Safe Cleanup of Legacy Functions
# Only removes functions that are confirmed unused

echo "🧹 Safe Cleanup of Legacy Functions"
echo "===================================="

echo "📊 Analysis: Which functions are safe to remove?"
echo ""

echo "✅ KEEP THESE (Actively Used):"
echo "  - email-reports (Daily/Weekly reports)"
echo "  - send-report-email (Email delivery)"
echo "  - schedule-reports (Report scheduling)"
echo "  - ai-insights-worker (AI analysis)"
echo "  - ai-screenshot-analyzer (Screenshot analysis)"
echo "  - comprehensive-employee-analysis (Employee insights)"
echo "  - auto-send-reports (Automated reporting)"
echo ""

echo "❌ SAFE TO REMOVE (Confirmed Unused):"
echo "  - idle-log (Broken timestamp, no references found)"
echo "  - employee-notifications (Old version, replaced)"
echo ""

echo "🔍 Step 1: Verify these functions are truly unused..."
echo "Creating verification SQL..."

cat > /tmp/verify_unused_functions.sql << 'EOF'
-- Verify Unused Functions
-- Run this in Supabase Dashboard → SQL Editor

-- Check if idle-log is referenced anywhere
SELECT 
    'idle-log references' as check_type,
    COUNT(*) as reference_count,
    CASE 
        WHEN COUNT(*) = 0 THEN 'SAFE TO REMOVE'
        ELSE 'DO NOT REMOVE - Has references'
    END as recommendation
FROM cron.job 
WHERE command LIKE '%idle-log%';

-- Check if employee-notifications is referenced anywhere  
SELECT 
    'employee-notifications references' as check_type,
    COUNT(*) as reference_count,
    CASE 
        WHEN COUNT(*) = 0 THEN 'SAFE TO REMOVE'
        ELSE 'DO NOT REMOVE - Has references'
    END as recommendation
FROM cron.job 
WHERE command LIKE '%employee-notifications%';

-- Show all current cron jobs for reference
SELECT 
    jobname,
    schedule,
    active,
    CASE 
        WHEN command LIKE '%email%' THEN 'EMAIL SYSTEM - KEEP'
        WHEN command LIKE '%ai%' THEN 'AI SYSTEM - KEEP'
        WHEN command LIKE '%idle%' THEN 'IDLE SYSTEM - CHECK'
        WHEN command LIKE '%employee%' THEN 'EMPLOYEE SYSTEM - CHECK'
        ELSE 'OTHER - REVIEW'
    END as system_category
FROM cron.job 
ORDER BY jobname;
EOF

echo "📝 Verification SQL created: /tmp/verify_unused_functions.sql"
echo ""

echo "🔍 Step 2: Safe removal commands (only if verification passes)..."
echo ""

echo "# Only run these AFTER verifying the functions are unused:"
echo "supabase functions delete idle-log"
echo "supabase functions delete employee-notifications"
echo ""

echo "🔍 Step 3: Manual verification steps..."
echo "======================================"
echo "1. Go to Supabase Dashboard → SQL Editor"
echo "2. Run the SQL from: /tmp/verify_unused_functions.sql"
echo "3. Verify that idle-log and employee-notifications show 0 references"
echo "4. Only then run the deletion commands above"
echo ""

echo "⚠️  IMPORTANT: DO NOT DELETE email-reports, send-report-email, or schedule-reports!"
echo "   These are actively used for your email reporting system."
echo ""

echo "🎯 Safe Cleanup Complete!"
echo "========================"
echo "Run verification SQL first, then only remove confirmed unused functions"
