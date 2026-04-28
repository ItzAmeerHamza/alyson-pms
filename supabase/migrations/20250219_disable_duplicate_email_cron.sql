-- Disable duplicate email cron jobs
-- These jobs were created in 20241215_fix_email_reports_direct_resend.sql
-- They conflict with the NestJS EmailReportsService which also sends these reports.

-- Unschedule the direct DB cron jobs
SELECT cron.unschedule('daily-email-reports-direct');
SELECT cron.unschedule('weekly-email-reports-direct');

-- Log the action
INSERT INTO public.system_logs (log_type, message, metadata) 
VALUES (
    'cron_cleanup',
    'Removed duplicate pg_cron email jobs',
    jsonb_build_object(
        'removed_jobs', ARRAY['daily-email-reports-direct', 'weekly-email-reports-direct'],
        'reason', 'Conflict with NestJS EmailReportsService',
        'migration_date', NOW()
    )
);
