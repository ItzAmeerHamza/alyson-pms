-- ============================================================
-- FIX FALSE POSITIVE DUPLICATES
-- ============================================================
-- Problem: Previous duplicate detection was too aggressive,
-- marking different screenshots as duplicates just because
-- they had the same app_name (e.g., all "Cursor" screenshots).
--
-- Solution: 
-- 1. Reset all false-positive duplicates
-- 2. Only mark as duplicate if EXACT same window_title
--    AND very low activity AND captured very close together
-- ============================================================

-- ============================================================
-- STEP 1: Reset all incorrectly marked duplicates
-- ============================================================

UPDATE screenshots
SET 
    is_duplicate = false,
    duplicate_reason = NULL,
    consecutive_duplicate_count = 0,
    duplicate_group_hash = NULL
WHERE is_duplicate = true;

-- ============================================================
-- STEP 2: Replace the detection function with stricter logic
-- ============================================================

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
    -- DUPLICATE DETECTION (STRICT)
    -- ========================================================
    -- Mark screenshot as duplicate ONLY if:
    -- 1. Same user_id as previous screenshot
    -- 2. EXACT same window_title (not just app_name!)
    -- 3. Both have activity_percent < 3% (very strict)
    -- 4. Within 5 minutes of each other
    -- 5. Window title must be non-empty and specific
    --
    -- This ensures we only catch TRULY identical screens like:
    -- - Lock screens / idle screens
    -- - Genuinely stuck on same content
    
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
            prev_dup_count + 1 as new_dup_count
        FROM consecutive_shots
        WHERE prev_id IS NOT NULL
          -- MUST have exact same window title (not just app name)
          AND window_title IS NOT NULL 
          AND LENGTH(TRIM(window_title)) > 5  -- Must be meaningful title
          AND window_title = prev_window  -- EXACT match required
          -- Both must have VERY low activity (< 3%)
          AND COALESCE(activity_percent, 0) < 3
          AND COALESCE(prev_activity, 0) < 3
          -- Within 5 minutes (not 15)
          AND captured_at - prev_time < INTERVAL '5 minutes'
          -- Exclude obvious working apps that just have same title
          AND LOWER(COALESCE(app_name, '')) NOT IN (
              'cursor', 'visual studio code', 'code', 'vscode',
              'sublime text', 'atom', 'intellij', 'webstorm', 'pycharm',
              'terminal', 'iterm', 'iterm2', 'warp', 'hyper',
              'google chrome', 'chrome', 'firefox', 'safari', 'edge', 'arc',
              'slack', 'discord', 'teams', 'zoom', 'meet'
          )
    )
    UPDATE screenshots s
    SET 
        is_duplicate = true,
        duplicate_reason = 'Exact same window with no activity for 5+ minutes',
        consecutive_duplicate_count = d.new_dup_count,
        duplicate_group_hash = MD5(d.user_id || COALESCE(d.window_title, '') || DATE(d.captured_at)::text)
    FROM duplicates d
    WHERE s.id = d.id
      AND (s.is_duplicate IS NULL OR s.is_duplicate = false);
    
    GET DIAGNOSTICS v_duplicates = ROW_COUNT;
    
    -- ========================================================
    -- IDLE INFERENCE (Keep this - it's useful)
    -- ========================================================
    -- Mark screenshot as idle if:
    -- 1. activity_percent = 0% (completely no keyboard/mouse)
    -- 2. OR window_title contains lock screen keywords
    
    UPDATE screenshots
    SET idle_inferred = true
    WHERE (idle_inferred IS NULL OR idle_inferred = false)
      AND captured_at > NOW() - INTERVAL '7 days'
      AND (
          -- Zero activity (no keyboard/mouse at all)
          activity_percent = 0
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
    
    -- Return results
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

