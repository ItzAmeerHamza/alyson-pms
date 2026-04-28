-- Fix AI Analysis Automation - Reliable Cron Jobs
-- This migration fixes broken cron authentication and adds proper automated AI analysis
-- 
-- Problem: Previous cron jobs used current_setting('app.supabase_service_role_key') 
-- which doesn't persist across database sessions.
--
-- Solution: Use direct SQL functions called by pg_cron instead of HTTP calls to edge functions.

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================================
-- STEP 1: Remove broken cron jobs
-- ============================================================================

DO $$
BEGIN
    -- Remove broken jobs that use session-scoped auth
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-insights-worker-scheduled') THEN
        PERFORM cron.unschedule('ai-insights-worker-scheduled');
    END IF;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-insights-worker-priority') THEN
        PERFORM cron.unschedule('ai-insights-worker-priority');
    END IF;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-insights-worker-business-hours') THEN
        PERFORM cron.unschedule('ai-insights-worker-business-hours');
    END IF;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-insights-worker-off-hours') THEN
        PERFORM cron.unschedule('ai-insights-worker-off-hours');
    END IF;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'chatgpt-ai-analysis') THEN
        PERFORM cron.unschedule('chatgpt-ai-analysis');
    END IF;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'chatgpt-ai-analysis-priority') THEN
        PERFORM cron.unschedule('chatgpt-ai-analysis-priority');
    END IF;
END $$;

-- ============================================================================
-- STEP 2: Create screenshot processing function (heuristic analysis)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_pending_screenshots(batch_limit INTEGER DEFAULT 100)
RETURNS TABLE (
    processed_count INTEGER,
    skipped_count INTEGER,
    failed_count INTEGER,
    elapsed_ms INTEGER
) AS $$
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
            
            -- ========== Entertainment Detection ==========
            IF v_title ~ '(youtube|netflix|twitch|tiktok|hulu|disney\+|prime video)' THEN
                -- Check if it's educational YouTube
                IF v_title ~ '(tutorial|course|learn|how to|programming|coding|training)' THEN
                    v_category := 'productive';
                    v_activity_type := 'learning';
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
                -- LinkedIn can be work-related
                IF v_title ~ 'linkedin' THEN
                    v_category := 'productive';
                    v_activity_type := 'networking';
                    v_distraction_score := 30;
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
            
            -- ========== Music (often acceptable while working) ==========
            ELSIF v_app ~ '(spotify|apple music|youtube music|soundcloud)' THEN
                v_category := 'entertainment';
                v_activity_type := 'music';
                v_distraction_score := 25;
                v_is_work_related := true; -- Music while working is acceptable
            
            -- ========== Research/Search ==========
            ELSIF v_title ~ '(google|bing|search|duckduckgo)' THEN
                v_category := 'productive';
                v_activity_type := 'research';
                v_distraction_score := 15;
            
            -- ========== Default: General browsing ==========
            ELSE
                v_category := 'productive';
                v_activity_type := 'general';
                v_distraction_score := 25;
            END IF;
            
            -- Update the screenshot
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
                    'analysis_version', '3.0.0-sql',
                    'processor', 'process_pending_screenshots',
                    'category', v_category,
                    'activity_type', v_activity_type,
                    'distraction_score', v_distraction_score,
                    'confidence_score', v_confidence_score,
                    'is_work_related', v_is_work_related
                )
            WHERE id = v_row.id
            AND ai_analysis_status = 'pending'; -- Idempotent guard
            
            IF FOUND THEN
                v_processed := v_processed + 1;
            ELSE
                v_skipped := v_skipped + 1;
            END IF;
            
        EXCEPTION WHEN OTHERS THEN
            v_failed := v_failed + 1;
            -- Mark as failed
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
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public';

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION public.process_pending_screenshots TO service_role;

COMMENT ON FUNCTION public.process_pending_screenshots IS 
'Processes pending screenshots using heuristic analysis. Called by pg_cron every 5 minutes.';

-- ============================================================================
-- STEP 3: Create employee insights generation function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_employee_insights(
    p_period_type TEXT DEFAULT 'day',
    p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    users_processed INTEGER,
    insights_created INTEGER,
    insights_updated INTEGER,
    elapsed_ms INTEGER
) AS $$
DECLARE
    start_time TIMESTAMPTZ := clock_timestamp();
    v_users_processed INTEGER := 0;
    v_insights_created INTEGER := 0;
    v_insights_updated INTEGER := 0;
    v_user RECORD;
    v_period_start TIMESTAMPTZ;
    v_period_end TIMESTAMPTZ;
    v_total_screenshots INTEGER;
    v_productive_screenshots INTEGER;
    v_entertainment_screenshots INTEGER;
    v_social_media_screenshots INTEGER;
    v_gaming_screenshots INTEGER;
    v_avg_distraction NUMERIC;
    v_productivity_score INTEGER;
    v_risk_level TEXT;
    v_total_hours NUMERIC;
    v_existing_id UUID;
BEGIN
    -- Calculate period boundaries
    v_period_end := NOW();
    CASE p_period_type
        WHEN 'day' THEN v_period_start := DATE_TRUNC('day', NOW());
        WHEN 'week' THEN v_period_start := DATE_TRUNC('week', NOW());
        WHEN 'month' THEN v_period_start := DATE_TRUNC('month', NOW());
        ELSE v_period_start := DATE_TRUNC('day', NOW());
    END CASE;
    
    -- Process each user with analyzed screenshots
    FOR v_user IN 
        SELECT DISTINCT s.user_id, u.email, u.full_name, u.role
        FROM public.screenshots s
        JOIN public.users u ON s.user_id = u.id
        WHERE s.ai_analysis_status = 'completed'
        AND s.captured_at >= v_period_start
        AND s.captured_at <= v_period_end
        AND (p_user_id IS NULL OR s.user_id = p_user_id)
        AND u.role != 'admin' -- Don't analyze admins
    LOOP
        BEGIN
            -- Get screenshot statistics for this user
            SELECT 
                COUNT(*),
                COUNT(*) FILTER (WHERE category = 'productive'),
                COUNT(*) FILTER (WHERE category = 'entertainment'),
                COUNT(*) FILTER (WHERE category = 'social_media'),
                COUNT(*) FILTER (WHERE category = 'gaming'),
                COALESCE(AVG(distraction_score), 0)
            INTO 
                v_total_screenshots,
                v_productive_screenshots,
                v_entertainment_screenshots,
                v_social_media_screenshots,
                v_gaming_screenshots,
                v_avg_distraction
            FROM public.screenshots
            WHERE user_id = v_user.user_id
            AND ai_analysis_status = 'completed'
            AND captured_at >= v_period_start
            AND captured_at <= v_period_end;
            
            -- Skip users with no screenshots
            IF v_total_screenshots = 0 THEN
                CONTINUE;
            END IF;
            
            -- Calculate productivity score (100 - weighted distraction)
            v_productivity_score := GREATEST(0, LEAST(100, 
                100 - (v_avg_distraction * 0.7) 
                    - (v_gaming_screenshots::NUMERIC / NULLIF(v_total_screenshots, 0) * 30)
                    - (v_entertainment_screenshots::NUMERIC / NULLIF(v_total_screenshots, 0) * 20)
                    - (v_social_media_screenshots::NUMERIC / NULLIF(v_total_screenshots, 0) * 15)
            ))::INTEGER;
            
            -- Determine risk level
            IF v_gaming_screenshots > 5 OR v_productivity_score < 40 THEN
                v_risk_level := 'high';
            ELSIF v_entertainment_screenshots > 10 OR v_productivity_score < 60 THEN
                v_risk_level := 'medium';
            ELSE
                v_risk_level := 'low';
            END IF;
            
            -- Estimate total hours (screenshots are typically every 5-10 minutes)
            v_total_hours := (v_total_screenshots * 5.0 / 60.0);
            
            -- Check if insight already exists for this period
            SELECT id INTO v_existing_id
            FROM public.ai_employee_insights
            WHERE user_id = v_user.user_id
            AND period_start = v_period_start
            AND period_end >= v_period_end - INTERVAL '1 hour';
            
            IF v_existing_id IS NOT NULL THEN
                -- Update existing insight
                UPDATE public.ai_employee_insights
                SET 
                    insights = jsonb_build_object(
                        'productivity_score', v_productivity_score,
                        'risk_level', v_risk_level,
                        'activity_percentage', ROUND((v_productive_screenshots::NUMERIC / NULLIF(v_total_screenshots, 0)) * 100),
                        'total_hours', ROUND(v_total_hours::NUMERIC, 1),
                        'screenshots_analyzed', v_total_screenshots,
                        'period_type', p_period_type,
                        'productivity_indicators', jsonb_build_object(
                            'productive_count', v_productive_screenshots,
                            'productive_percentage', ROUND((v_productive_screenshots::NUMERIC / NULLIF(v_total_screenshots, 0)) * 100)
                        ),
                        'distraction_indicators', jsonb_build_object(
                            'distraction_score', ROUND(v_avg_distraction),
                            'entertainment_count', v_entertainment_screenshots,
                            'social_media_count', v_social_media_screenshots,
                            'gaming_count', v_gaming_screenshots,
                            'non_work_percentage', ROUND(((v_entertainment_screenshots + v_social_media_screenshots + v_gaming_screenshots)::NUMERIC / NULLIF(v_total_screenshots, 0)) * 100)
                        ),
                        'behavioral_patterns', jsonb_build_object(
                            'work_style', CASE 
                                WHEN v_productivity_score >= 80 THEN 'Highly focused'
                                WHEN v_productivity_score >= 60 THEN 'Generally productive'
                                WHEN v_productivity_score >= 40 THEN 'Needs improvement'
                                ELSE 'Requires attention'
                            END
                        ),
                        'executive_summary', CASE 
                            WHEN v_productivity_score >= 80 THEN 
                                v_user.full_name || ' showed excellent productivity with ' || v_productive_screenshots || ' productive sessions.'
                            WHEN v_productivity_score >= 60 THEN 
                                v_user.full_name || ' maintained good productivity. Consider reducing distractions.'
                            WHEN v_productivity_score >= 40 THEN 
                                v_user.full_name || ' needs improvement. Found ' || (v_entertainment_screenshots + v_social_media_screenshots) || ' distracted sessions.'
                            ELSE 
                                v_user.full_name || ' requires attention. High distraction detected with ' || v_gaming_screenshots || ' gaming sessions.'
                        END,
                        'work_description', 'Analysis based on ' || v_total_screenshots || ' screenshots over ' || ROUND(v_total_hours::NUMERIC, 1) || ' hours.'
                    ),
                    confidence_score = 0.85,  -- Decimal format (0-1)
                    ai_model = 'sql-aggregation',
                    analysis_version = '3.0.0-sql',
                    updated_at = NOW(),
                    period_end = v_period_end
                WHERE id = v_existing_id;
                
                v_insights_updated := v_insights_updated + 1;
            ELSE
                -- Insert new insight
                INSERT INTO public.ai_employee_insights (
                    user_id,
                    analysis_type,
                    period_start,
                    period_end,
                    insights,
                    confidence_score,
                    ai_model,
                    analysis_version
                ) VALUES (
                    v_user.user_id,
                    'comprehensive',
                    v_period_start,
                    v_period_end,
                    jsonb_build_object(
                        'productivity_score', v_productivity_score,
                        'risk_level', v_risk_level,
                        'activity_percentage', ROUND((v_productive_screenshots::NUMERIC / NULLIF(v_total_screenshots, 0)) * 100),
                        'total_hours', ROUND(v_total_hours::NUMERIC, 1),
                        'screenshots_analyzed', v_total_screenshots,
                        'period_type', p_period_type,
                        'productivity_indicators', jsonb_build_object(
                            'productive_count', v_productive_screenshots,
                            'productive_percentage', ROUND((v_productive_screenshots::NUMERIC / NULLIF(v_total_screenshots, 0)) * 100)
                        ),
                        'distraction_indicators', jsonb_build_object(
                            'distraction_score', ROUND(v_avg_distraction),
                            'entertainment_count', v_entertainment_screenshots,
                            'social_media_count', v_social_media_screenshots,
                            'gaming_count', v_gaming_screenshots,
                            'non_work_percentage', ROUND(((v_entertainment_screenshots + v_social_media_screenshots + v_gaming_screenshots)::NUMERIC / NULLIF(v_total_screenshots, 0)) * 100)
                        ),
                        'behavioral_patterns', jsonb_build_object(
                            'work_style', CASE 
                                WHEN v_productivity_score >= 80 THEN 'Highly focused'
                                WHEN v_productivity_score >= 60 THEN 'Generally productive'
                                WHEN v_productivity_score >= 40 THEN 'Needs improvement'
                                ELSE 'Requires attention'
                            END
                        ),
                        'executive_summary', CASE 
                            WHEN v_productivity_score >= 80 THEN 
                                v_user.full_name || ' showed excellent productivity with ' || v_productive_screenshots || ' productive sessions.'
                            WHEN v_productivity_score >= 60 THEN 
                                v_user.full_name || ' maintained good productivity. Consider reducing distractions.'
                            WHEN v_productivity_score >= 40 THEN 
                                v_user.full_name || ' needs improvement. Found ' || (v_entertainment_screenshots + v_social_media_screenshots) || ' distracted sessions.'
                            ELSE 
                                v_user.full_name || ' requires attention. High distraction detected with ' || v_gaming_screenshots || ' gaming sessions.'
                        END,
                        'work_description', 'Analysis based on ' || v_total_screenshots || ' screenshots over ' || ROUND(v_total_hours::NUMERIC, 1) || ' hours.'
                    ),
                    0.85,  -- Decimal format (0-1)
                    'sql-aggregation',
                    '3.0.0-sql'
                );
                
                v_insights_created := v_insights_created + 1;
            END IF;
            
            v_users_processed := v_users_processed + 1;
            
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Error processing user %: %', v_user.user_id, SQLERRM;
        END;
    END LOOP;
    
    RETURN QUERY SELECT 
        v_users_processed,
        v_insights_created,
        v_insights_updated,
        EXTRACT(MILLISECONDS FROM (clock_timestamp() - start_time))::INTEGER;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public';

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION public.generate_employee_insights TO service_role;

COMMENT ON FUNCTION public.generate_employee_insights IS 
'Generates employee productivity insights by aggregating analyzed screenshots. Called by pg_cron hourly.';

-- ============================================================================
-- STEP 4: Create wrapper functions for cron (simpler return types)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.run_screenshot_processor()
RETURNS VOID AS $$
DECLARE
    result RECORD;
BEGIN
    SELECT * INTO result FROM public.process_pending_screenshots(100);
    
    -- Log the result
    IF to_regclass('public.system_logs') IS NOT NULL THEN
        INSERT INTO public.system_logs (log_type, message, metadata)
        VALUES (
            'ai_automation',
            'Screenshot processor completed',
            jsonb_build_object(
                'processed', result.processed_count,
                'skipped', result.skipped_count,
                'failed', result.failed_count,
                'elapsed_ms', result.elapsed_ms,
                'timestamp', NOW()
            )
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public';

CREATE OR REPLACE FUNCTION public.run_insights_generator()
RETURNS VOID AS $$
DECLARE
    result RECORD;
BEGIN
    SELECT * INTO result FROM public.generate_employee_insights('day', NULL);
    
    -- Log the result
    IF to_regclass('public.system_logs') IS NOT NULL THEN
        INSERT INTO public.system_logs (log_type, message, metadata)
        VALUES (
            'ai_automation',
            'Employee insights generator completed',
            jsonb_build_object(
                'users_processed', result.users_processed,
                'insights_created', result.insights_created,
                'insights_updated', result.insights_updated,
                'elapsed_ms', result.elapsed_ms,
                'timestamp', NOW()
            )
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.run_screenshot_processor TO service_role;
GRANT EXECUTE ON FUNCTION public.run_insights_generator TO service_role;

-- ============================================================================
-- STEP 5: Schedule cron jobs
-- ============================================================================

-- Screenshot processor - every 5 minutes
SELECT cron.schedule(
    'ai-screenshot-processor',
    '*/5 * * * *',
    'SELECT public.run_screenshot_processor();'
);

-- Employee insights generator - every hour
SELECT cron.schedule(
    'ai-insights-generator-hourly',
    '0 * * * *',
    'SELECT public.run_insights_generator();'
);

-- Daily comprehensive insights - at 8 PM (end of workday)
SELECT cron.schedule(
    'ai-insights-generator-daily',
    '0 20 * * *',
    'SELECT public.run_insights_generator();'
);

-- Cleanup failed screenshots - reset to pending after 24 hours (daily at 2 AM)
SELECT cron.schedule(
    'ai-cleanup-failed',
    '0 2 * * *',
    $$
    UPDATE public.screenshots 
    SET ai_analysis_status = 'pending'
    WHERE ai_analysis_status = 'failed' 
      AND captured_at < NOW() - INTERVAL '24 hours';
    $$
);

-- ============================================================================
-- STEP 6: Log the migration
-- ============================================================================

DO $$
BEGIN
    IF to_regclass('public.system_logs') IS NOT NULL THEN
        INSERT INTO public.system_logs (log_type, message, metadata)
        VALUES (
            'migration',
            'AI Automation Cron Jobs Fixed',
            jsonb_build_object(
                'migration_file', '20250102000002_fix_ai_automation_cron.sql',
                'changes', jsonb_build_array(
                    'Removed broken cron jobs with session-scoped auth',
                    'Created process_pending_screenshots() SQL function',
                    'Created generate_employee_insights() SQL function',
                    'Scheduled ai-screenshot-processor every 5 minutes',
                    'Scheduled ai-insights-generator-hourly every hour',
                    'Scheduled ai-insights-generator-daily at 8 PM',
                    'Scheduled ai-cleanup-failed daily at 2 AM'
                ),
                'cron_jobs', jsonb_build_object(
                    'ai-screenshot-processor', '*/5 * * * * (every 5 minutes)',
                    'ai-insights-generator-hourly', '0 * * * * (every hour)',
                    'ai-insights-generator-daily', '0 20 * * * (daily at 8 PM)',
                    'ai-cleanup-failed', '0 2 * * * (daily at 2 AM)'
                ),
                'timestamp', NOW()
            )
        );
    END IF;
END $$;

-- ============================================================================
-- STEP 7: Verify cron jobs
-- ============================================================================

DO $$
DECLARE
    job_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO job_count
    FROM cron.job
    WHERE jobname IN (
        'ai-screenshot-processor',
        'ai-insights-generator-hourly',
        'ai-insights-generator-daily',
        'ai-cleanup-failed'
    );
    
    IF job_count = 4 THEN
        RAISE NOTICE '✅ All 4 AI automation cron jobs created successfully';
    ELSE
        RAISE WARNING '⚠️ Expected 4 cron jobs, found %', job_count;
    END IF;
END $$;

