-- ============================================================
-- FIX DUPLICATE DETECTION ACCURACY
-- ============================================================
-- Fixes two issues:
-- 1. FALSE POSITIVES: Screenshots with high activity marked as duplicate
-- 2. FALSE NEGATIVES: Identical browser screenshots with 0% activity not detected
-- ============================================================

-- ============================================================
-- STEP 1: Remove FALSE POSITIVES
-- ============================================================
-- Reset duplicates that have > 10% activity (clearly not idle/stuck)
-- Real duplicates should have very low activity

UPDATE screenshots
SET 
    is_duplicate = false,
    duplicate_reason = 'Cleared: High activity indicates active work',
    duplicate_group_hash = NULL
WHERE is_duplicate = true
  AND activity_percent > 10;

-- ============================================================
-- STEP 2: Drop and recreate the detection function
-- ============================================================
-- Key changes:
-- 1. Don't exclude browsers when activity is 0% (truly idle)
-- 2. Keep the strict 3% threshold for IDEs/terminals
-- 3. Allow detection for any app when activity is exactly 0%

DROP FUNCTION IF EXISTS detect_duplicates_and_idle();

CREATE OR REPLACE FUNCTION detect_duplicates_and_idle()
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
    -- DUPLICATE DETECTION (IMPROVED)
    -- ========================================================
    -- Mark screenshot as duplicate if:
    -- CASE A: Zero activity on same window (ANY app, including browsers)
    --   - activity_percent = 0
    --   - Same window_title
    --   - Within 10 minutes
    --
    -- CASE B: Very low activity on non-work apps
    --   - activity_percent < 3%
    --   - Same window_title
    --   - Within 5 minutes
    --   - Not an IDE/terminal (code changes even with low activity)
    
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
        FROM screenshots s
        WHERE s.captured_at > NOW() - INTERVAL '7 days'
    ),
    duplicates AS (
        SELECT 
            id,
            user_id,
            app_name,
            window_title,
            captured_at,
            activity_percent,
            prev_dup_count + 1 as new_dup_count,
            CASE 
                WHEN COALESCE(activity_percent, 0) = 0 AND COALESCE(prev_activity, 0) = 0 
                THEN 'Zero activity on same screen'
                ELSE 'Very low activity on same screen'
            END as reason
        FROM consecutive_shots
        WHERE prev_id IS NOT NULL
          -- MUST have exact same window title
          AND window_title IS NOT NULL 
          AND LENGTH(TRIM(window_title)) > 5
          AND window_title = prev_window
          AND (
              -- CASE A: Zero activity - detect for ANY app (including browsers)
              (
                  COALESCE(activity_percent, 0) = 0
                  AND COALESCE(prev_activity, 0) = 0
                  AND captured_at - prev_time < INTERVAL '10 minutes'
              )
              OR
              -- CASE B: Very low activity - only for non-IDE apps
              (
                  COALESCE(activity_percent, 0) < 3
                  AND COALESCE(prev_activity, 0) < 3
                  AND captured_at - prev_time < INTERVAL '5 minutes'
                  -- Exclude IDEs/terminals (code can change even with low activity)
                  AND LOWER(COALESCE(app_name, '')) NOT IN (
                      'cursor', 'visual studio code', 'code', 'vscode',
                      'sublime text', 'atom', 'intellij', 'webstorm', 'pycharm',
                      'android studio', 'xcode', 'eclipse', 'netbeans',
                      'terminal', 'iterm', 'iterm2', 'warp', 'hyper', 'powershell',
                      'postman', 'insomnia'
                  )
              )
          )
    )
    UPDATE screenshots s
    SET 
        is_duplicate = true,
        duplicate_reason = d.reason,
        consecutive_duplicate_count = d.new_dup_count,
        duplicate_group_hash = MD5(d.user_id || COALESCE(d.window_title, '') || DATE(d.captured_at)::text)
    FROM duplicates d
    WHERE s.id = d.id
      AND (s.is_duplicate IS NULL OR s.is_duplicate = false);
    
    GET DIAGNOSTICS v_duplicates = ROW_COUNT;
    
    -- ========================================================
    -- IDLE INFERENCE
    -- ========================================================
    UPDATE screenshots
    SET idle_inferred = true
    WHERE (idle_inferred IS NULL OR idle_inferred = false)
      AND captured_at > NOW() - INTERVAL '7 days'
      AND (
          activity_percent = 0
          OR LOWER(COALESCE(window_title, '')) LIKE '%lock screen%'
          OR LOWER(COALESCE(window_title, '')) LIKE '%screensaver%'
          OR LOWER(COALESCE(window_title, '')) LIKE '%screen saver%'
          OR LOWER(COALESCE(app_name, '')) LIKE '%loginwindow%'
          OR LOWER(COALESCE(app_name, '')) LIKE '%lockapp%'
          OR LOWER(COALESCE(window_title, '')) LIKE '%windows security%'
          OR LOWER(COALESCE(window_title, '')) LIKE '%sign-in%'
      );
      
    GET DIAGNOSTICS v_idle = ROW_COUNT;
    
    duplicates_marked := v_duplicates;
    idle_marked := v_idle;
    elapsed_ms := EXTRACT(MILLISECOND FROM (clock_timestamp() - start_time))::INTEGER;
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- STEP 3: Run the corrected detection
-- ============================================================

SELECT * FROM detect_duplicates_and_idle();
