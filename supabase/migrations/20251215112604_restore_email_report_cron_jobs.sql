-- ============================================================================
-- RESTORE EMAIL REPORT CRON JOBS
-- ============================================================================
-- This migration re-enables automated email reports that were previously 
-- disabled. The cron jobs call the email-reports Edge Function which handles
-- report generation and sending via Resend API.
--
-- SECURITY REQUIREMENT:
-- This migration requires the service role key to be configured securely.
-- Run: SELECT public.configure_service_role_key('YOUR_SERVICE_ROLE_KEY');
-- See: 20250126_configure_service_key_setting.sql
--
-- Previous migrations that removed these:
-- - 20250126_remove_broken_email_cron.sql
-- - 20250219_disable_duplicate_email_cron.sql

-- Ensure pg_cron and pg_net extensions are enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any existing email report cron jobs to avoid duplicates
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-email-report-v2') THEN
        PERFORM cron.unschedule('daily-email-report-v2');
    END IF;
    
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-email-report-v2') THEN
        PERFORM cron.unschedule('weekly-email-report-v2');
    END IF;
END $$;

-- Daily Email Report - Every day at 7 PM UTC (10 PM Saudi Arabia Time)
SELECT cron.schedule(
    'daily-email-report-v2',
    '0 19 * * *',
    $$
    SELECT net.http_post(
        url := 'https://fkpiqcxkmrtaetvfgcli.supabase.co/functions/v1/email-reports/send-daily-report',
        headers := format('{"Content-Type": "application/json", "Authorization": "Bearer %s"}', current_setting('app.supabase_service_role_key'))::jsonb,
        body := '{}'::jsonb
    ) AS request_id;
    $$
);

-- Weekly Email Report - Every Thursday at 7 PM UTC (10 PM Saudi Arabia Time)
SELECT cron.schedule(
    'weekly-email-report-v2',
    '0 19 * * 4',
    $$
    SELECT net.http_post(
        url := 'https://fkpiqcxkmrtaetvfgcli.supabase.co/functions/v1/email-reports/send-weekly-report',
        headers := format('{"Content-Type": "application/json", "Authorization": "Bearer %s"}', current_setting('app.supabase_service_role_key'))::jsonb,
        body := '{}'::jsonb
    ) AS request_id;
    $$
);

-- Add comment to report_configurations table
COMMENT ON TABLE public.report_configurations IS 
'Email report configurations. Automated sending is handled by pg_cron jobs (daily-email-report-v2, weekly-email-report-v2) that trigger the email-reports Edge Function.';

-- Log the restoration
DO $$
BEGIN
    RAISE NOTICE 'Email report cron jobs restored successfully';
    RAISE NOTICE 'Daily report: Every day at 19:00 UTC (22:00 Saudi Arabia)';
    RAISE NOTICE 'Weekly report: Every Thursday at 19:00 UTC (22:00 Saudi Arabia)';
END $$;

