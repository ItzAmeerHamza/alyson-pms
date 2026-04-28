-- ============================================================================
-- Schedule AI Edge Function for Comprehensive Employee Analysis
-- Uses pg_net to call the Edge Function from pg_cron
-- ============================================================================

-- Enable pg_net extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- STEP 1: Create function to call AI Edge Function for all active users using pg_net
CREATE OR REPLACE FUNCTION public.run_ai_employee_analysis()
RETURNS TABLE (
    users_queued INTEGER,
    elapsed_ms INTEGER
) AS $$
DECLARE
    start_time TIMESTAMPTZ := clock_timestamp();
    v_user RECORD;
    v_count INTEGER := 0;
    v_anon_key TEXT := '***ANON_KEY_REMOVED***';
BEGIN
    -- Get users with screenshots in last 24 hours (at least 5 screenshots)
    FOR v_user IN 
        SELECT DISTINCT s.user_id
        FROM screenshots s
        WHERE s.captured_at > NOW() - INTERVAL '24 hours'
          AND s.ai_analysis_status = 'completed'
        GROUP BY s.user_id
        HAVING COUNT(*) >= 5
    LOOP
        BEGIN
            -- Queue HTTP request using pg_net
            PERFORM net.http_post(
                url := 'https://fkpiqcxkmrtaetvfgcli.supabase.co/functions/v1/comprehensive-employee-analysis',
                headers := jsonb_build_object(
                    'Authorization', 'Bearer ' || v_anon_key,
                    'Content-Type', 'application/json'
                ),
                body := jsonb_build_object(
                    'user_id', v_user.user_id,
                    'period_type', 'day'
                )
            );
            
            v_count := v_count + 1;
            
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Error queuing analysis for user %: %', v_user.user_id, SQLERRM;
        END;
    END LOOP;
    
    -- Log the result
    INSERT INTO public.system_logs (log_type, message, metadata)
    VALUES (
        'ai_automation',
        'AI Employee Analysis queued via pg_net',
        jsonb_build_object(
            'users_queued', v_count,
            'elapsed_ms', EXTRACT(MILLISECONDS FROM (clock_timestamp() - start_time))::INTEGER,
            'timestamp', NOW()
        )
    );
    
    users_queued := v_count;
    elapsed_ms := EXTRACT(MILLISECONDS FROM (clock_timestamp() - start_time))::INTEGER;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute
GRANT EXECUTE ON FUNCTION public.run_ai_employee_analysis TO service_role;

-- STEP 2: Create simple wrapper for cron (named differently to avoid conflict with existing trigger)
CREATE OR REPLACE FUNCTION public.cron_run_ai_analysis()
RETURNS VOID AS $$
BEGIN
    PERFORM * FROM public.run_ai_employee_analysis();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.cron_run_ai_analysis TO service_role;

-- STEP 3: Remove old SQL-based insights generator cron jobs (ignore if not exists)
DO $$
BEGIN
    PERFORM cron.unschedule('ai-insights-generator-hourly');
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'ai-insights-generator-hourly not found, skipping';
END;
$$;

DO $$
BEGIN
    PERFORM cron.unschedule('ai-insights-generator-daily');
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'ai-insights-generator-daily not found, skipping';
END;
$$;

-- STEP 4: Schedule AI Edge Function to run every hour
SELECT cron.schedule(
    'ai-edge-analysis-hourly',
    '5 * * * *',
    'SELECT public.cron_run_ai_analysis();'
);

-- STEP 5: Also run at end of workday for comprehensive daily analysis
SELECT cron.schedule(
    'ai-edge-analysis-daily',
    '0 20 * * *',
    'SELECT public.cron_run_ai_analysis();'
);

-- Log migration
INSERT INTO public.system_logs (log_type, message, metadata)
VALUES (
    'migration',
    'Scheduled AI Edge Function for employee analysis',
    jsonb_build_object(
        'hourly_schedule', '5 * * * *',
        'daily_schedule', '0 20 * * *',
        'uses', 'pg_net extension'
    )
);
