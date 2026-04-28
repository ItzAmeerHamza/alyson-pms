-- ============================================================
-- DISABLE SQL-BASED DUPLICATE DETECTION
-- ============================================================
-- Problem: The SQL function detect_duplicates_and_idle() marks screenshots
-- as duplicates based on window_title matching, which causes FALSE POSITIVES
-- when browsing different pages of the same website.
--
-- Solution: Disable SQL-based detection and rely on the Vision Validator's
-- perceptual hash comparison (Hamming distance) which is more accurate.
-- ============================================================

-- Columns used by Vision Validator and later migrations (no earlier migration added them)
ALTER TABLE public.screenshots
  ADD COLUMN IF NOT EXISTS vision_validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS needs_vision_validation BOOLEAN;

-- ============================================================
-- STEP 1: Clear ALL existing SQL-detected duplicates
-- ============================================================
-- Only clear duplicates that were NOT detected by perceptual hash
-- (i.e., those detected by the SQL window_title matching)

UPDATE public.screenshots
SET 
    is_duplicate = false,
    duplicate_reason = 'Cleared: SQL-based detection disabled, awaiting perceptual hash validation',
    duplicate_group_hash = NULL,
    consecutive_duplicate_count = 0
WHERE is_duplicate = true
  AND (
    -- Clear if duplicate_reason indicates SQL detection (not perceptual hash)
    duplicate_reason LIKE '%same screen%'
    OR duplicate_reason LIKE '%same window%'
    OR duplicate_reason LIKE '%Zero activity%'
    OR duplicate_reason LIKE '%Very low activity%'
    -- OR if no perceptual hash validation was done
    OR (duplicate_reason IS NULL AND vision_validated_at IS NULL)
  );

-- ============================================================
-- STEP 2: Drop the aggressive duplicate detection functions
-- ============================================================

DROP FUNCTION IF EXISTS detect_duplicates_and_idle();
DROP FUNCTION IF EXISTS run_duplicate_idle_detection();

-- ============================================================
-- STEP 3: Create a new function that ONLY handles idle inference
-- ============================================================
-- Keep idle inference but remove duplicate detection

CREATE OR REPLACE FUNCTION infer_idle_screenshots()
RETURNS TABLE (
    idle_marked INTEGER,
    elapsed_ms INTEGER
) AS $$
DECLARE
    start_time TIMESTAMPTZ := clock_timestamp();
    v_idle INTEGER := 0;
BEGIN
    -- Mark screenshots as idle based on obvious idle indicators
    UPDATE public.screenshots
    SET idle_inferred = true
    WHERE (idle_inferred IS NULL OR idle_inferred = false)
      AND captured_at > NOW() - INTERVAL '7 days'
      AND (
          -- Zero activity is a strong idle indicator
          activity_percent = 0
          -- Lock screen indicators
          OR LOWER(COALESCE(window_title, '')) LIKE '%lock screen%'
          OR LOWER(COALESCE(window_title, '')) LIKE '%screensaver%'
          OR LOWER(COALESCE(window_title, '')) LIKE '%screen saver%'
          OR LOWER(COALESCE(app_name, '')) LIKE '%loginwindow%'
          OR LOWER(COALESCE(app_name, '')) LIKE '%lockapp%'
          OR LOWER(COALESCE(window_title, '')) LIKE '%windows security%'
          OR LOWER(COALESCE(window_title, '')) LIKE '%sign-in%'
      );
      
    GET DIAGNOSTICS v_idle = ROW_COUNT;
    
    idle_marked := v_idle;
    elapsed_ms := EXTRACT(MILLISECOND FROM (clock_timestamp() - start_time))::INTEGER;
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION infer_idle_screenshots() TO authenticated;
GRANT EXECUTE ON FUNCTION infer_idle_screenshots() TO service_role;

-- ============================================================
-- STEP 4: Update any cron jobs that used the old functions
-- ============================================================

-- Check if cron extension exists before trying to update
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Remove any cron job that calls detect_duplicates_and_idle
        PERFORM cron.unschedule(jobname) 
        FROM cron.job 
        WHERE command LIKE '%detect_duplicates_and_idle%'
           OR command LIKE '%run_duplicate_idle_detection%';
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Ignore errors if pg_cron is not available
    NULL;
END $$;

-- ============================================================
-- STEP 5: Add comment explaining the new approach
-- ============================================================

COMMENT ON FUNCTION infer_idle_screenshots() IS 
'Infers idle state for screenshots based on activity level and window indicators.
Duplicate detection is now handled EXCLUSIVELY by the Vision Validator edge function
using perceptual hash (dHash) comparison with Hamming distance thresholds.

The old detect_duplicates_and_idle() function was causing FALSE POSITIVES by
marking screenshots as duplicates based on window_title matching, which fails
when browsing different pages of the same website.

Vision Validator thresholds:
- EXACT_DUPLICATE: Hamming distance = 0 (identical images)
- NEAR_DUPLICATE: Hamming distance <= 5 (same screen, minor cursor movement)
- SIMILAR_CONTENT: Hamming distance <= 10 (same page, slight scroll)';

-- ============================================================
-- STEP 6: Mark screenshots that need validation
-- ============================================================
-- Flag recent screenshots without perceptual hash validation for review

UPDATE public.screenshots
SET needs_vision_validation = true
WHERE captured_at > NOW() - INTERVAL '7 days'
  AND vision_validated_at IS NULL
  AND perceptual_hash IS NOT NULL
  AND (needs_vision_validation IS NULL OR needs_vision_validation = false);

-- Migration complete: SQL-based duplicate detection disabled
-- Duplicate detection is now handled by Vision Validator using perceptual hash
