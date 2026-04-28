-- Migration: Update AI Analysis Cron Jobs to Work All Day (v2)
-- Date: 2025-01-19
-- Purpose: Make AI analysis run continuously instead of just business hours
-- Note: Using proper cron functions to avoid permission issues

-- Step 1: Ensure a priority cron job exists and runs all day
DO $$
DECLARE
  v_jobid integer;
BEGIN
  SELECT jobid INTO v_jobid
  FROM cron.job
  WHERE jobname = 'ai-insights-priority';

  IF v_jobid IS NULL THEN
    PERFORM cron.schedule(
      'ai-insights-priority',
      '*/10 * * * *',
      'SELECT public.run_ai_insights_priority();'
    );
  ELSE
    PERFORM cron.alter_job(v_jobid, '*/10 * * * *', NULL, NULL, NULL, NULL);
  END IF;
END $$;

-- Step 2: Business hours enhancement (named, idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-insights-priority-business-hours') THEN
    PERFORM cron.unschedule('ai-insights-priority-business-hours');
  END IF;

  PERFORM cron.schedule(
    'ai-insights-priority-business-hours',
    '*/5 9-17 * * 1-5',
    'SELECT public.run_ai_insights_priority();'
  );
END $$;

-- Step 3: Off-hours job (named, idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-insights-priority-off-hours') THEN
    PERFORM cron.unschedule('ai-insights-priority-off-hours');
  END IF;

  PERFORM cron.schedule(
    'ai-insights-priority-off-hours',
    '0 */2 * * *',
    'SELECT public.run_ai_insights_priority();'
  );
END $$;

-- Step 4: Update the existing daily job (created in 20250102000002_fix_ai_automation_cron.sql)
DO $$
DECLARE
  v_daily_jobid integer;
BEGIN
  SELECT jobid INTO v_daily_jobid
  FROM cron.job
  WHERE jobname = 'ai-insights-generator-daily';

  IF v_daily_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(v_daily_jobid, '0 8,20 * * *', NULL, NULL, NULL, NULL);
  END IF;
END $$;

-- Step 5: Log the changes
DO $$
BEGIN
  IF to_regclass('public.system_logs') IS NOT NULL THEN
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
            'executed_by', 'migration_v2',
            'method', 'cron_functions'
        )
    );
  END IF;
END $$;

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
