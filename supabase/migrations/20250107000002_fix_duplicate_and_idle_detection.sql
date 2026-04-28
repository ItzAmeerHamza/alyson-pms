-- ============================================================
-- FIX DUPLICATE AND IDLE DETECTION
-- ============================================================
-- This migration adds proper duplicate detection and idle inference
-- to the screenshots table via a SQL function run by pg_cron.
--
-- Problem: The backend NestJS duplicate detector was disabled,
-- and no replacement was ever implemented.
--
-- Solution: SQL-based detection that runs every 5 minutes.
-- ============================================================

-- ============================================================
-- STEP 1: Create the detection function
-- ============================================================

CREATE OR REPLACE FUNCTION public.detect_duplicates_and_idle()
RETURNS TABLE (
    duplicates_marked INTEGER,
    idle_marked INTEGER,
    elapsed_ms INTEGER
) AS $$
DECLARE
    start_time TIMESTAMPTZ := clock_timestamp();
    v_duplicates INTEGER := 0;
    v_idle INTEGER := 0;
BEGIN
    -- ========================================================
    -- DUPLICATE DETECTION
    -- ========================================================
    -- Mark screenshot as duplicate if:
    -- 1. Same user_id as previous screenshot
    -- 2. Same app_name
    -- 3. Both have activity_percent < 10%
    -- 4. Within 15 minutes of each other
    
    WITH consecutive_shots AS (
        SELECT 
            s.id,
            s.user_id,
            s.app_name,
            s.window_title,
            s.activity_percent,
            s.captured_at,
            LAG(s.id) OVER (PARTITION BY s.user_id ORDER BY s.captured_at) as prev_id,
            LAG(s.app_name) OVER (PARTITION BY s.user_id ORDER BY s.captured_at) as prev_app,
            LAG(s.window_title) OVER (PARTITION BY s.user_id ORDER BY s.captured_at) as prev_window,
            LAG(s.activity_percent) OVER (PARTITION BY s.user_id ORDER BY s.captured_at) as prev_activity,
            LAG(s.captured_at) OVER (PARTITION BY s.user_id ORDER BY s.captured_at) as prev_time,
            COALESCE(LAG(s.consecutive_duplicate_count) OVER (PARTITION BY s.user_id ORDER BY s.captured_at), 0) as prev_dup_count
        FROM public.screenshots s
        WHERE s.captured_at > NOW() - INTERVAL '7 days'
          AND (s.is_duplicate IS NULL OR s.is_duplicate = false)
    ),
    duplicates AS (
        SELECT 
            id,
            user_id,
            app_name,
            captured_at,
            prev_dup_count + 1 as new_dup_count
        FROM consecutive_shots
        WHERE prev_id IS NOT NULL
          AND (
              -- Same app with low activity
              (app_name IS NOT NULL AND app_name = prev_app AND activity_percent < 10 AND prev_activity < 10)
              OR
              -- Same window title with low activity
              (window_title IS NOT NULL AND window_title = prev_window AND activity_percent < 10 AND prev_activity < 10)
          )
          AND captured_at - prev_time < INTERVAL '15 minutes'
    )
    UPDATE public.screenshots s
    SET 
        is_duplicate = true,
        duplicate_reason = 'Same app/window with low activity within 15 minutes',
        consecutive_duplicate_count = d.new_dup_count,
        duplicate_group_hash = MD5(d.user_id::text || COALESCE(d.app_name, 'unknown') || DATE(d.captured_at)::text)
    FROM duplicates d
    WHERE s.id = d.id
      AND (s.is_duplicate IS NULL OR s.is_duplicate = false);
    
    GET DIAGNOSTICS v_duplicates = ROW_COUNT;
    
    -- ========================================================
    -- IDLE INFERENCE
    -- ========================================================
    -- Mark screenshot as idle if:
    -- 1. activity_percent < 5%
    -- 2. OR consecutive_duplicate_count >= 3
    -- 3. OR window_title contains lock screen / screensaver keywords
    
    UPDATE public.screenshots
    SET idle_inferred = true
    WHERE (idle_inferred IS NULL OR idle_inferred = false)
      AND captured_at > NOW() - INTERVAL '7 days'
      AND (
          -- Very low activity
          activity_percent < 5
          -- Multiple consecutive duplicates
          OR consecutive_duplicate_count >= 3
          -- Lock screen / screensaver detection
          OR LOWER(COALESCE(window_title, '')) LIKE '%lock screen%'
          OR LOWER(COALESCE(window_title, '')) LIKE '%screensaver%'
          OR LOWER(COALESCE(window_title, '')) LIKE '%screen saver%'
          OR LOWER(COALESCE(app_name, '')) LIKE '%loginwindow%'
          OR LOWER(COALESCE(app_name, '')) LIKE '%lockapp%'
          -- Windows lock screen
          OR LOWER(COALESCE(window_title, '')) LIKE '%windows security%'
          OR LOWER(COALESCE(window_title, '')) LIKE '%sign-in%'
      );
      
    GET DIAGNOSTICS v_idle = ROW_COUNT;
    
    -- Log the results
    IF v_duplicates > 0 OR v_idle > 0 THEN
        IF to_regclass('public.system_logs') IS NOT NULL THEN
            INSERT INTO public.system_logs (log_type, message, metadata)
            VALUES (
                'duplicate_idle_detection',
                'Duplicate and idle detection completed',
                jsonb_build_object(
                    'duplicates_marked', v_duplicates,
                    'idle_marked', v_idle,
                    'elapsed_ms', EXTRACT(MILLISECONDS FROM (clock_timestamp() - start_time))::INTEGER,
                    'timestamp', NOW()
                )
            );
        END IF;
    END IF;
    
    RETURN QUERY SELECT 
        v_duplicates,
        v_idle,
        EXTRACT(MILLISECONDS FROM (clock_timestamp() - start_time))::INTEGER;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.detect_duplicates_and_idle TO service_role;

COMMENT ON FUNCTION detect_duplicates_and_idle IS 
'Detects duplicate screenshots and infers idle status. Run by pg_cron every 5 minutes.';

-- ============================================================
-- STEP 2: Create wrapper for cron (simpler return type)
-- ============================================================

CREATE OR REPLACE FUNCTION public.run_duplicate_idle_detection()
RETURNS VOID AS $$
DECLARE
    result RECORD;
BEGIN
    SELECT * INTO result FROM public.detect_duplicates_and_idle();
    
    -- Only log if something was detected
    IF result.duplicates_marked > 0 OR result.idle_marked > 0 THEN
        RAISE NOTICE 'Duplicate/Idle detection: % duplicates, % idle in %ms', 
            result.duplicates_marked, result.idle_marked, result.elapsed_ms;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public';

GRANT EXECUTE ON FUNCTION public.run_duplicate_idle_detection TO service_role;

-- ============================================================
-- STEP 3: Schedule via pg_cron
-- ============================================================

-- Remove if exists (idempotent)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'detect-duplicates-idle') THEN
        PERFORM cron.unschedule('detect-duplicates-idle');
    END IF;
END $$;

-- Schedule to run every 5 minutes
SELECT cron.schedule(
    'detect-duplicates-idle',
    '*/5 * * * *',
    'SELECT public.run_duplicate_idle_detection();'
);

-- ============================================================
-- STEP 4: Run once to backfill existing data
-- ============================================================

-- Backfill duplicates for last 7 days
DO $$
DECLARE
    result RECORD;
BEGIN
    SELECT * INTO result FROM public.detect_duplicates_and_idle();
    RAISE NOTICE 'Backfill complete: % duplicates marked, % idle inferred', 
        result.duplicates_marked, result.idle_marked;
END $$;

-- ============================================================
-- STEP 5: Log migration
-- ============================================================

DO $$
BEGIN
    IF to_regclass('public.system_logs') IS NOT NULL THEN
        INSERT INTO public.system_logs (log_type, message, metadata)
        VALUES (
            'migration',
            'Added duplicate and idle detection',
            jsonb_build_object(
                'migration_file', '20250107000002_fix_duplicate_and_idle_detection.sql',
                'changes', jsonb_build_array(
                    'Created detect_duplicates_and_idle() function',
                    'Created run_duplicate_idle_detection() wrapper',
                    'Scheduled pg_cron job every 5 minutes',
                    'Backfilled existing screenshots'
                ),
                'timestamp', NOW()
            )
        );
    END IF;
END $$;

-- ============================================================
-- STEP 6: Verify cron job
-- ============================================================

DO $$
DECLARE
    job_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'detect-duplicates-idle'
    ) INTO job_exists;
    
    IF job_exists THEN
        RAISE NOTICE '✅ Duplicate/idle detection cron job scheduled successfully';
    ELSE
        RAISE WARNING '⚠️ Failed to schedule cron job';
    END IF;
END $$;

