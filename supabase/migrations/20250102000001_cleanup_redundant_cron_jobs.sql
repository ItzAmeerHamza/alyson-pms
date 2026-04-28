-- ============================================================================
-- CLEANUP REDUNDANT CRON JOBS
-- ============================================================================
-- This migration removes redundant AI cron jobs that have been replaced by
-- more reliable SQL function-based jobs.
--
-- Jobs being removed:
-- - ai-insights-worker-every-15min (HTTP POST, replaced by ai-screenshot-processor)
-- - ai-insights-worker-daily (HTTP POST, replaced by ai-insights-generator-daily)
-- - ai_session_2min (HTTP POST with anon key, unreliable)
-- - Two unnamed jobs calling run_ai_insights_priority (redundant)
--
-- Jobs being kept:
-- - ai-screenshot-processor (SQL function, every 5 min)
-- - ai-insights-generator-hourly (SQL function, hourly)
-- - ai-insights-generator-daily (SQL function, daily 8 PM)
-- - ai-cleanup-failed (SQL function, daily 2 AM)
-- - daily-email-report-v2 (HTTP POST, working)
-- - weekly-email-report-v2 (HTTP POST, working)
-- - cleanup-url-slices (SQL function)

-- ============================================================================
-- STEP 1: Remove redundant named cron jobs
-- ============================================================================

DO $$
BEGIN
    -- Remove ai-insights-worker-every-15min (replaced by ai-screenshot-processor)
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-insights-worker-every-15min') THEN
        PERFORM cron.unschedule('ai-insights-worker-every-15min');
        RAISE NOTICE '✓ Removed ai-insights-worker-every-15min (redundant with ai-screenshot-processor)';
    END IF;
    
    -- Remove ai-insights-worker-daily (replaced by ai-insights-generator-daily)
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-insights-worker-daily') THEN
        PERFORM cron.unschedule('ai-insights-worker-daily');
        RAISE NOTICE '✓ Removed ai-insights-worker-daily (redundant with ai-insights-generator-daily)';
    END IF;
    
    -- Remove ai_session_2min (uses anon key, unreliable for protected operations)
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai_session_2min') THEN
        PERFORM cron.unschedule('ai_session_2min');
        RAISE NOTICE '✓ Removed ai_session_2min (uses anon key, replaced by ai-screenshot-processor)';
    END IF;
END $$;

-- ============================================================================
-- STEP 2: Remove unnamed cron jobs calling run_ai_insights_priority
-- ============================================================================

DO $$
DECLARE
    v_job RECORD;
    v_removed_count INTEGER := 0;
BEGIN
    -- Find and remove unnamed jobs that call run_ai_insights_priority
    FOR v_job IN 
        SELECT jobid 
        FROM cron.job 
        WHERE jobname IS NULL 
          AND command LIKE '%run_ai_insights_priority%'
    LOOP
        PERFORM cron.unschedule(v_job.jobid);
        v_removed_count := v_removed_count + 1;
        RAISE NOTICE '✓ Removed unnamed job (jobid: %) calling run_ai_insights_priority', v_job.jobid;
    END LOOP;
    
    IF v_removed_count > 0 THEN
        RAISE NOTICE '✓ Removed % unnamed cron job(s)', v_removed_count;
    ELSE
        RAISE NOTICE '✓ No unnamed run_ai_insights_priority jobs found';
    END IF;
END $$;

-- ============================================================================
-- STEP 3: Drop the run_ai_insights_priority function if no longer needed
-- ============================================================================

-- Check if the function exists and drop it (it's redundant with the new SQL functions)
DROP FUNCTION IF EXISTS public.run_ai_insights_priority();
DROP FUNCTION IF EXISTS public.run_ai_insights_daily();

-- ============================================================================
-- STEP 4: Log the cleanup
-- ============================================================================

DO $$
BEGIN
    IF to_regclass('public.system_logs') IS NOT NULL THEN
        INSERT INTO public.system_logs (log_type, message, metadata, created_at)
        VALUES (
            'cron_cleanup',
            'Cleaned up redundant AI cron jobs',
            jsonb_build_object(
                'removed_jobs', ARRAY[
                    'ai-insights-worker-every-15min',
                    'ai-insights-worker-daily', 
                    'ai_session_2min',
                    'unnamed run_ai_insights_priority jobs'
                ],
                'kept_jobs', ARRAY[
                    'ai-screenshot-processor',
                    'ai-insights-generator-hourly',
                    'ai-insights-generator-daily',
                    'ai-cleanup-failed',
                    'daily-email-report-v2',
                    'weekly-email-report-v2',
                    'cleanup-url-slices'
                ],
                'migration', '20250102000001_cleanup_redundant_cron_jobs',
                'reason', 'Replaced HTTP POST jobs with reliable SQL function jobs'
            ),
            NOW()
        )
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- ============================================================================
-- STEP 5: Verify remaining cron jobs
-- ============================================================================

DO $$
DECLARE
    v_job_count INTEGER;
    v_jobs TEXT;
BEGIN
    SELECT COUNT(*), string_agg(COALESCE(jobname, 'unnamed'), ', ' ORDER BY jobname)
    INTO v_job_count, v_jobs
    FROM cron.job;
    
    RAISE NOTICE '=== CRON JOB CLEANUP COMPLETE ===';
    RAISE NOTICE 'Remaining jobs (%): %', v_job_count, v_jobs;
END $$;

