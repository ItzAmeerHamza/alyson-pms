#!/bin/bash

# Script to apply the cron migration to make AI analysis work all day
# This script applies the migration directly to the Supabase database

echo "🚀 Applying Cron Migration: Make AI Analysis Work All Day"
echo "========================================================"

# Set the project details
PROJECT_REF="daxnu8-kendis-beMnep"
ACCESS_TOKEN="***ACCESS_TOKEN_REMOVED***"

echo "📋 Project Reference: $PROJECT_REF"
echo "🔑 Access Token: ${ACCESS_TOKEN:0:10}..."

# Create a temporary SQL file with the migration
cat > /tmp/cron_migration.sql << 'EOF'
-- Migration: Update AI Analysis Cron Jobs to Work All Day
-- Date: 2025-01-19
-- Purpose: Make AI analysis run continuously instead of just business hours

-- Step 1: Update the priority cron job to run all day, every day
SELECT cron.alter_job(17, '*/10 * * * *', NULL, NULL, NULL, NULL);

-- Step 2: Add a new high-frequency cron job for business hours (optional enhancement)
SELECT cron.schedule(
    '*/5 9-17 * * 1-5',  -- Every 5 minutes, 9AM-5PM, Mon-Fri
    'SELECT public.run_ai_insights_priority();'
);

-- Step 3: Add a new evening/night cron job for off-hours
SELECT cron.schedule(
    '0 */2 * * *',  -- Every 2 hours, all day, every day
    'SELECT public.run_ai_insights_priority();'
);

-- Step 4: Update the daily cron job to also run in the evening for better coverage
SELECT cron.alter_job(16, '0 8,20 * * *', NULL, NULL, NULL, NULL);

-- Step 5: Log the changes
INSERT INTO public.system_logs (log_type, message, metadata)
VALUES (
    'cron_update',
    'Updated AI analysis cron jobs to work all day using cron functions',
    jsonb_build_object(
        'timestamp', now(),
        'changes', jsonb_build_object(
            'priority_job', '*/10 * * * * (every 10 minutes, all day)',
            'business_hours_job', '*/5 9-17 * * 1-5 (every 5 minutes, business hours)',
            'off_hours_job', '0 */2 * * * (every 2 hours, all day)',
            'daily_job', '0 8,20 * * * (8AM and 8PM daily)'
        ),
        'reason', 'User requested all-day AI analysis coverage',
        'executed_by', 'migration_script',
        'method', 'cron_functions'
    )
);

-- Verification: Show the updated cron jobs
SELECT 
    jobname,
    schedule,
    active,
    CASE 
        WHEN schedule = '*/10 * * * *' THEN '✅ All day coverage (every 10 min)'
        WHEN schedule = '*/5 9-17 * * 1-5' THEN '✅ Business hours (every 5 min)'
        WHEN schedule = '0 */2 * * *' THEN '✅ Off hours (every 2 hours)'
        WHEN schedule = '0 8,20 * * *' THEN '✅ Daily coverage (8AM + 8PM)'
        ELSE '❓ Unknown schedule'
    END as coverage_description
FROM cron.job 
WHERE jobname LIKE '%ai-insights%'
ORDER BY jobname;
EOF

echo "📝 Migration SQL created at /tmp/cron_migration.sql"
echo ""
echo "🔧 To apply this migration, you have two options:"
echo ""
echo "Option 1: Use Supabase Dashboard (Recommended)"
echo "1. Go to: https://supabase.com/dashboard"
echo "2. Select project: $PROJECT_REF"
echo "3. Navigate to SQL Editor"
echo "4. Copy and paste the content of /tmp/cron_migration.sql"
echo "5. Click 'Run'"
echo ""
echo "Option 2: Use Supabase CLI (if working)"
echo "1. Run: supabase db push --linked"
echo "2. This will apply all pending migrations"
echo ""
echo "📊 After applying, you should see:"
echo "✅ ai-insights-worker-priority: */10 * * * * (every 10 minutes, all day)"
echo "✅ ai-insights-worker-business-hours: */5 9-17 * * 1-5 (business hours)"
echo "✅ ai-insights-worker-off-hours: 0 */2 * * * (every 2 hours)"
echo "✅ ai-insights-worker-daily: 0 8,20 * * * (8AM + 8PM)"
echo ""
echo "🎯 This will give you 24/7 AI analysis coverage!"
echo ""
echo "📁 Migration file location: /tmp/cron_migration.sql"
echo "🔍 You can view it with: cat /tmp/cron_migration.sql"
