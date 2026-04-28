-- ============================================================
-- FIX SOCIAL MEDIA BUSINESS TOOLS DETECTION
-- ============================================================
-- Problem: "Snapchat Ads Manager", "TikTok Ads Manager", and similar
-- business advertising tools are incorrectly classified as social_media
-- with high distraction scores, when they should be productive work tools.
--
-- Solution: Add detection for business/advertising tools BEFORE checking
-- for social media platform names.
-- ============================================================

-- ============================================================
-- STEP 1: Fix existing incorrectly categorized screenshots
-- ============================================================

UPDATE screenshots
SET 
    category = 'productive',
    activity_type = 'advertising',
    distraction_score = 15,
    is_work_related = true,
    ai_metadata = COALESCE(ai_metadata, '{}'::jsonb) || jsonb_build_object(
        'recategorized_at', NOW(),
        'recategorized_reason', 'Business advertising tool incorrectly marked as social media',
        'previous_category', category,
        'previous_activity_type', activity_type
    )
WHERE category = 'social_media'
  AND (
    LOWER(window_title) LIKE '%ads manager%'
    OR LOWER(window_title) LIKE '%business suite%'
    OR LOWER(window_title) LIKE '%campaign manager%'
    OR LOWER(window_title) LIKE '%business manager%'
    OR LOWER(window_title) LIKE '%ad account%'
    OR LOWER(window_title) LIKE '%ads center%'
    OR LOWER(window_title) LIKE '%creator studio%'
  );

-- ============================================================
-- STEP 2: Update the process_pending_screenshots function
-- ============================================================
-- Add business/advertising tools detection BEFORE social media detection

CREATE OR REPLACE FUNCTION public.process_pending_screenshots(batch_limit integer DEFAULT 100)
 RETURNS TABLE(processed_count integer, skipped_count integer, failed_count integer, elapsed_ms integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    start_time TIMESTAMPTZ := clock_timestamp();
    v_processed INTEGER := 0;
    v_skipped INTEGER := 0;
    v_failed INTEGER := 0;
    v_row RECORD;
    v_category TEXT;
    v_activity_type TEXT;
    v_distraction_score INTEGER;
    v_confidence_score INTEGER;
    v_is_work_related BOOLEAN;
    v_title TEXT;
    v_app TEXT;
BEGIN
    -- Process pending screenshots in batches
    FOR v_row IN 
        SELECT id, window_title, app_name, user_id
        FROM public.screenshots
        WHERE ai_analysis_status = 'pending'
        ORDER BY captured_at DESC
        LIMIT batch_limit
        FOR UPDATE SKIP LOCKED
    LOOP
        BEGIN
            v_title := LOWER(COALESCE(v_row.window_title, ''));
            v_app := LOWER(COALESCE(v_row.app_name, ''));
            
            -- Default values
            v_category := 'productive';
            v_activity_type := 'work';
            v_distraction_score := 20;
            v_confidence_score := 85;
            v_is_work_related := true;
            
            -- ========== Business/Advertising Tools Detection (NEW - CHECK FIRST) ==========
            -- Detect business tools from social media platforms BEFORE checking for platform names
            -- This prevents false positives for Snapchat Ads Manager, TikTok Ads, etc.
            IF v_title ~ '(ads manager|business suite|campaign manager|business manager|ad account|ads center|creator studio|meta business|commerce manager)' THEN
                v_category := 'productive';
                v_activity_type := 'advertising';
                v_distraction_score := 15;
                v_confidence_score := 90;
                v_is_work_related := true;
            
            -- ========== Entertainment Detection ==========
            ELSIF v_title ~ '(youtube|netflix|twitch|tiktok|hulu|disney\+|prime video)' THEN
                -- Check if it's educational YouTube or business tool
                IF v_title ~ '(tutorial|course|learn|how to|programming|coding|training)' THEN
                    v_category := 'productive';
                    v_activity_type := 'learning';
                    v_distraction_score := 15;
                    v_is_work_related := true;
                -- TikTok/YouTube with ads/analytics context is business
                ELSIF v_title ~ '(ads|analytics|insights|dashboard|creator|studio)' THEN
                    v_category := 'productive';
                    v_activity_type := 'advertising';
                    v_distraction_score := 15;
                    v_is_work_related := true;
                ELSE
                    v_category := 'entertainment';
                    v_activity_type := 'media';
                    v_distraction_score := 80;
                    v_is_work_related := false;
                END IF;
            
            -- ========== Social Media Detection ==========
            ELSIF v_title ~ '(facebook|instagram|twitter|x\.com|snapchat|reddit|tiktok|linkedin)' THEN
                -- LinkedIn is always work-related networking
                IF v_title ~ 'linkedin' THEN
                    v_category := 'productive';
                    v_activity_type := 'networking';
                    v_distraction_score := 30;
                    v_is_work_related := true;
                -- Check for business/professional context
                ELSIF v_title ~ '(business|professional|insights|analytics|shop|commerce|pixel|conversions)' THEN
                    v_category := 'productive';
                    v_activity_type := 'advertising';
                    v_distraction_score := 20;
                    v_is_work_related := true;
                ELSE
                    v_category := 'social_media';
                    v_activity_type := 'social';
                    v_distraction_score := 70;
                    v_is_work_related := false;
                END IF;
            
            -- ========== Gaming Detection ==========
            ELSIF v_title ~ '(steam|epic games|battle\.net|minecraft|roblox|fortnite|league of legends)' 
                  OR v_app ~ '(steam|game|minecraft|roblox)' THEN
                v_category := 'gaming';
                v_activity_type := 'gaming';
                v_distraction_score := 95;
                v_is_work_related := false;
                v_confidence_score := 95;
            
            -- ========== Shopping Detection ==========
            ELSIF v_title ~ '(amazon|ebay|aliexpress|shopping|cart|checkout|etsy)' THEN
                v_category := 'shopping';
                v_activity_type := 'shopping';
                v_distraction_score := 60;
                v_is_work_related := false;
            
            -- ========== Development Tools ==========
            ELSIF v_title ~ '(github|gitlab|stackoverflow|bitbucket|dev\.to|docs\.)'
                  OR v_app ~ '(code|studio|xcode|intellij|vim|emacs|sublime|atom|cursor)' THEN
                v_category := 'productive';
                v_activity_type := 'development';
                v_distraction_score := 5;
                v_confidence_score := 95;
            
            -- ========== Communication Tools ==========
            ELSIF v_title ~ '(slack|teams|discord|zoom|meet|webex)' 
                  OR v_app ~ '(slack|teams|discord|zoom|meet)' THEN
                v_category := 'productive';
                v_activity_type := 'communication';
                v_distraction_score := 20;
                v_confidence_score := 95;
            
            -- ========== Email ==========
            ELSIF v_title ~ '(gmail|outlook|mail|inbox)' 
                  OR v_app ~ '(mail|outlook)' THEN
                v_category := 'productive';
                v_activity_type := 'email';
                v_distraction_score := 10;
            
            -- ========== Office/Productivity Apps ==========
            ELSIF v_app ~ '(excel|sheets|numbers|word|docs|pages|powerpoint|slides|keynote)' THEN
                v_category := 'productive';
                v_activity_type := 'document';
                v_distraction_score := 10;
                v_confidence_score := 90;
            
            -- ========== Design Tools ==========
            ELSIF v_app ~ '(photoshop|illustrator|figma|sketch|canva|affinity)' THEN
                v_category := 'productive';
                v_activity_type := 'design';
                v_distraction_score := 15;
                v_confidence_score := 85;
            
            -- ========== Music ==========
            ELSIF v_app ~ '(spotify|apple music|youtube music|soundcloud)' THEN
                v_category := 'entertainment';
                v_activity_type := 'music';
                v_distraction_score := 25;
                v_is_work_related := true;
            
            -- ========== Research/Search ==========
            ELSIF v_title ~ '(google|bing|search|duckduckgo)' THEN
                v_category := 'productive';
                v_activity_type := 'research';
                v_distraction_score := 15;
            
            -- ========== Default ==========
            ELSE
                v_category := 'productive';
                v_activity_type := 'general';
                v_distraction_score := 25;
            END IF;
            
            UPDATE public.screenshots
            SET 
                ai_analysis_status = 'completed',
                category = v_category,
                activity_type = v_activity_type,
                distraction_score = v_distraction_score,
                confidence_score = v_confidence_score,
                is_work_related = v_is_work_related,
                ai_analyzed_at = NOW(),
                ai_model_used = 'sql-heuristic',
                ai_metadata = jsonb_build_object(
                    'analyzed_at', NOW(),
                    'analysis_version', '3.1.0-sql',
                    'processor', 'process_pending_screenshots',
                    'category', v_category,
                    'activity_type', v_activity_type,
                    'distraction_score', v_distraction_score,
                    'confidence_score', v_confidence_score,
                    'is_work_related', v_is_work_related
                )
            WHERE id = v_row.id
            AND ai_analysis_status = 'pending';
            
            IF FOUND THEN
                v_processed := v_processed + 1;
            ELSE
                v_skipped := v_skipped + 1;
            END IF;
            
        EXCEPTION WHEN OTHERS THEN
            v_failed := v_failed + 1;
            UPDATE public.screenshots
            SET ai_analysis_status = 'failed',
                ai_metadata = jsonb_build_object('error', SQLERRM, 'failed_at', NOW())
            WHERE id = v_row.id;
        END;
    END LOOP;
    
    RETURN QUERY SELECT 
        v_processed,
        v_skipped,
        v_failed,
        EXTRACT(MILLISECONDS FROM (clock_timestamp() - start_time))::INTEGER;
END;
$function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.process_pending_screenshots TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_pending_screenshots TO service_role;

-- ============================================================
-- STEP 3: Log the migration
-- ============================================================

INSERT INTO public.system_logs (log_type, message, metadata)
VALUES (
    'migration',
    'Fixed social media business tools detection',
    jsonb_build_object(
        'migration_file', '20260118_fix_social_media_business_tools.sql',
        'changes', ARRAY[
            'Added business/advertising tools detection BEFORE social media check',
            'Fixed existing Snapchat Ads Manager screenshots',
            'Added patterns: ads manager, business suite, campaign manager, etc.',
            'Updated analysis_version to 3.1.0-sql'
        ],
        'timestamp', NOW()
    )
);

-- ============================================================
-- Migration complete
-- ============================================================
-- Business advertising tools (Ads Manager, Business Suite, Campaign Manager)
-- are now correctly classified as productive/advertising with low distraction
-- ============================================================
