
-- Update the weekly report configuration to end on Thursday instead of Monday
DO $$
BEGIN
  IF to_regclass('public.report_configurations') IS NOT NULL THEN
    UPDATE public.report_configurations 
    SET 
      schedule_cron = '0 19 * * 4',  -- Thursday at 7 PM (day 4 of week)
      schedule_description = 'Weekly on Thursday at 7 PM'
    WHERE name = 'Weekly Performance Report for Ebdaadt';
  END IF;
END $$;

-- Update the cron job to match the new schedule
DO $$
DECLARE
  v_supabase_url text;
  v_service_role_key text;
BEGIN
  -- Remove the old job only if it exists
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-email-reports') THEN
    PERFORM cron.unschedule('weekly-email-reports');
  END IF;

  -- Only (re)create the job if runtime settings exist (avoid placeholder strings)
  v_supabase_url := current_setting('app.supabase_url', true);
  v_service_role_key := current_setting('app.service_role_key', true);

  IF v_supabase_url IS NOT NULL AND v_supabase_url <> ''
     AND v_service_role_key IS NOT NULL AND v_service_role_key <> '' THEN
    PERFORM cron.schedule(
      'weekly-email-reports',
      '0 19 * * 4',
      format($cmd$
        SELECT
          net.http_post(
            url := '%s/functions/v1/email-reports/send-weekly-report',
            headers := jsonb_build_object('Content-Type','application/json','Authorization', 'Bearer %s'),
            body := '{"automated": true}'::jsonb
          ) as request_id;
      $cmd$, v_supabase_url, v_service_role_key)
    );
  END IF;
END $$;

-- Verify the updated configuration
SELECT 
  name,
  schedule_cron,
  schedule_description
FROM report_configurations 
WHERE name LIKE '%Weekly%';

-- Check the updated cron jobs
SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE '%email%';
