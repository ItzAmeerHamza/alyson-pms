-- Migration: Update AI Analysis Cron Jobs to Work All Day (v3)
-- Date: 2025-08-19
-- Purpose: Make AI analysis run continuously instead of just business hours
-- Note: Using proper cron functions to avoid permission issues

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
        'executed_by', 'migration_v3',
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
