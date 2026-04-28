-- Setup Supabase Cron Jobs for ChatGPT Duplicate Detection
-- This migration configures automated AI analysis using pg_cron

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create ChatGPT AI Analysis Cron Job
-- Runs every 10 minutes to process pending screenshots with ChatGPT Vision API
SELECT cron.schedule(
    'chatgpt-ai-analysis',           -- job name
    '*/10 * * * *',                  -- every 10 minutes
    $$
    SELECT
      net.http_post(
          url:='https://fkpiqcxkmrtaetvfgcli.supabase.co/functions/v1/schedule-ai-analysis',
          headers:=format('{"Content-Type": "application/json", "Authorization": "Bearer %s"}', current_setting('app.supabase_service_role_key'))::jsonb,
          body:='{"automated": true, "source": "cron_job"}'::jsonb
      ) as request_id;
    $$
);

-- Create High-Priority AI Analysis Cron Job  
-- Runs every 3 minutes during business hours for faster processing
SELECT cron.schedule(
    'chatgpt-ai-analysis-priority',  -- job name
    '*/3 9-17 * * 1-5',             -- every 3 minutes, 9AM-5PM, Monday-Friday
    $$
    SELECT
      net.http_post(
          url:='https://fkpiqcxkmrtaetvfgcli.supabase.co/functions/v1/schedule-ai-analysis',
          headers:=format('{"Content-Type": "application/json", "Authorization": "Bearer %s"}', current_setting('app.supabase_service_role_key'))::jsonb,
          body:='{"automated": true, "source": "priority_cron", "limit": 50}'::jsonb
      ) as request_id;
    $$
);

-- Create Database Cleanup Cron Job
-- Runs daily at 2 AM to clean up failed analysis attempts
SELECT cron.schedule(
    'chatgpt-analysis-cleanup',      -- job name  
    '0 2 * * *',                     -- daily at 2 AM
    $$
    -- Reset failed analysis status after 24 hours
    UPDATE screenshots 
    SET ai_analysis_status = 'pending'
    WHERE ai_analysis_status = 'failed' 
      AND captured_at < NOW() - INTERVAL '24 hours';
      
    -- Clean up old processing status (stuck for >1 hour)
    UPDATE screenshots 
    SET ai_analysis_status = 'pending'
    WHERE ai_analysis_status = 'processing' 
      AND captured_at < NOW() - INTERVAL '1 hour';
    $$
);

-- Create Performance Monitoring Cron Job
-- Runs every hour to log ChatGPT analysis performance
SELECT cron.schedule(
    'chatgpt-analysis-monitoring',   -- job name
    '0 * * * *',                     -- every hour
    $$
    INSERT INTO public.system_logs (
        log_type,
        message,
        metadata,
        created_at
    )
    SELECT 
        'chatgpt_analysis_stats',
        'Hourly ChatGPT analysis performance report',
        jsonb_build_object(
            'total_screenshots', (SELECT COUNT(*) FROM screenshots WHERE captured_at >= NOW() - INTERVAL '1 hour'),
            'analyzed_screenshots', (SELECT COUNT(*) FROM screenshots WHERE ai_analysis_status = 'completed' AND captured_at >= NOW() - INTERVAL '1 hour'),
            'pending_screenshots', (SELECT COUNT(*) FROM screenshots WHERE ai_analysis_status = 'pending'),
            'failed_screenshots', (SELECT COUNT(*) FROM screenshots WHERE ai_analysis_status = 'failed' AND captured_at >= NOW() - INTERVAL '1 hour'),
            'duplicates_detected', (SELECT COUNT(*) FROM screenshots WHERE is_duplicate = true AND captured_at >= NOW() - INTERVAL '1 hour'),
            'chatgpt_analysis_rate', ROUND(
                (SELECT COUNT(*) FROM screenshots WHERE ai_analysis_status = 'completed' AND captured_at >= NOW() - INTERVAL '1 hour')::DECIMAL / 
                NULLIF((SELECT COUNT(*) FROM screenshots WHERE captured_at >= NOW() - INTERVAL '1 hour'), 0) * 100, 2
            )
        ),
        NOW();
    $$
);

-- Create system_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.system_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    log_type TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_system_logs_type_created ON public.system_logs(log_type, created_at);

-- Grant necessary permissions
GRANT SELECT, INSERT ON public.system_logs TO postgres;
GRANT SELECT, UPDATE ON public.screenshots TO postgres;

-- Add comments for documentation
COMMENT ON TABLE public.system_logs IS 'System monitoring and performance logs for ChatGPT analysis';

-- Log the cron job setup
INSERT INTO public.system_logs (log_type, message, metadata) 
VALUES (
    'cron_setup',
    'ChatGPT duplicate detection cron jobs configured',
    jsonb_build_object(
        'jobs', ARRAY['chatgpt-ai-analysis', 'chatgpt-ai-analysis-priority', 'chatgpt-analysis-cleanup', 'chatgpt-analysis-monitoring'],
        'schedules', jsonb_build_object(
            'regular_analysis', '*/10 * * * * (every 10 minutes)',
            'priority_analysis', '*/3 9-17 * * 1-5 (every 3 minutes during business hours)',
            'cleanup', '0 2 * * * (daily at 2 AM)',
            'monitoring', '0 * * * * (every hour)'
        ),
        'description', 'Automated ChatGPT Vision API duplicate detection system'
    )
);

-- Show current cron jobs
SELECT 
    jobname,
    schedule,
    active,
    jobid
FROM cron.job 
WHERE jobname LIKE '%chatgpt%' OR jobname LIKE '%ai-analysis%'
ORDER BY jobname; 