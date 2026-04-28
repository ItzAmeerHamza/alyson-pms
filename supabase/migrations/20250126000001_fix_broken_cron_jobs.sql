-- Fix broken cron jobs pointing to deleted functions
-- This migration cleans up obsolete cron jobs and replaces them with working functions

-- 1. Remove obsolete cron jobs pointing to deleted schedule-ai-analysis function
SELECT cron.unschedule('chatgpt-ai-analysis');
SELECT cron.unschedule('chatgpt-ai-analysis-priority');

-- Note: Keep the cleanup and monitoring jobs as they use direct SQL
-- SELECT cron.unschedule('chatgpt-analysis-cleanup');
-- SELECT cron.unschedule('chatgpt-analysis-monitoring');

-- 2. Create new cron job pointing to working ai-insights-worker function
SELECT cron.schedule(
    'ai-insights-worker-scheduled',           -- job name
    '*/10 * * * *',                          -- every 10 minutes
    $$
    SELECT
      net.http_post(
          url:='https://fkpiqcxkmrtaetvfgcli.supabase.co/functions/v1/ai-insights-worker',
          headers:=format('{"Content-Type": "application/json", "Authorization": "Bearer %s"}', current_setting('app.supabase_service_role_key'))::jsonb,
          body:='{"action": "run-scheduled", "source": "cron_job", "limit": 50}'::jsonb
      ) as request_id;
    $$
);

-- 3. Create high-priority AI analysis cron job for business hours
SELECT cron.schedule(
    'ai-insights-worker-priority',           -- job name  
    '*/5 9-17 * * 1-5',                     -- every 5 minutes, 9AM-5PM, Monday-Friday
    $$
    SELECT
      net.http_post(
          url:='https://fkpiqcxkmrtaetvfgcli.supabase.co/functions/v1/ai-insights-worker',
          headers:=format('{"Content-Type": "application/json", "Authorization": "Bearer %s"}', current_setting('app.supabase_service_role_key'))::jsonb,
          body:='{"action": "run-scheduled", "source": "priority_cron", "limit": 100}'::jsonb
      ) as request_id;
    $$
);

-- 4. Log the cron job updates
INSERT INTO public.system_logs (log_type, message, metadata) 
VALUES (
    'cron_update',
    'Fixed broken cron jobs and replaced with working ai-insights-worker',
    jsonb_build_object(
        'removed_jobs', ARRAY['chatgpt-ai-analysis', 'chatgpt-ai-analysis-priority'],
        'added_jobs', ARRAY['ai-insights-worker-scheduled', 'ai-insights-worker-priority'],
        'new_schedules', jsonb_build_object(
            'ai_insights_regular', '*/10 * * * * (every 10 minutes)',
            'ai_insights_priority', '*/5 9-17 * * 1-5 (every 5 minutes during business hours)'
        ),
        'target_function', 'ai-insights-worker',
        'migration_date', NOW()
    )
);

-- 5. Show current active cron jobs
SELECT 
    jobname,
    schedule,
    active,
    jobid,
    'Active AI analysis cron jobs' as status
FROM cron.job 
WHERE jobname LIKE '%ai%' OR jobname LIKE '%insights%'
ORDER BY jobname;
