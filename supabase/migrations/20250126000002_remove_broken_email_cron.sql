-- Remove broken email cron job with placeholders
-- The backend EmailReportsService already handles email automation properly

-- 1. Unschedule the broken weekly email cron job
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-email-reports') THEN
    PERFORM cron.unschedule('weekly-email-reports');
  END IF;
END $$;

-- 2. Log the removal
DO $$
BEGIN
  IF to_regclass('public.system_logs') IS NOT NULL THEN
    INSERT INTO public.system_logs (log_type, message, metadata) 
    VALUES (
        'cron_cleanup',
        'Removed broken weekly email cron job with placeholders',
        jsonb_build_object(
            'removed_job', 'weekly-email-reports',
            'reason', 'Contains unresolved placeholders [SET_SUPABASE_URL] and [SET_SERVICE_ROLE_KEY]',
            'alternative', 'Backend EmailReportsService handles email automation with proper cron jobs',
            'backend_crons', ARRAY['Daily at 19:00', 'Weekly Monday at 09:00', 'Dynamic processing every 15 minutes'],
            'migration_date', NOW()
        )
    );
  END IF;
END $$;

-- 3. Keep the report configuration but add note about backend handling
DO $$
BEGIN
  IF to_regclass('public.report_configurations') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'report_configurations'
         AND column_name = 'notes'
     ) THEN
    UPDATE public.report_configurations 
    SET 
      notes = COALESCE(notes, '') || ' [AUTOMATION: Handled by backend EmailReportsService, not pg_cron]'
    WHERE name = 'Weekly Performance Report for Ebdaadt';
  END IF;
END $$;

-- 4. Show remaining cron jobs (should exclude the broken email job)
SELECT 
    jobname,
    schedule,
    active,
    'Active cron jobs after cleanup' as status
FROM cron.job 
WHERE active = true
ORDER BY jobname;
