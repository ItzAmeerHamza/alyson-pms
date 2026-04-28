-- ============================================================================
-- Schedule AI Screenshot Analyzer Edge Function via pg_cron
-- ============================================================================
-- The ai-screenshot-analyzer edge function performs deep AI analysis using
-- Qwen3-32B text + Qwen2.5-VL vision models. It creates admin_alerts for
-- non-work activity (gaming, social media, entertainment, shopping).
--
-- Previously this function was NEVER scheduled automatically -- it only ran
-- when manually triggered from the web admin. This migration schedules it
-- every 10 minutes for screenshots flagged as non-work by the SQL heuristic
-- (process_pending_screenshots) that haven't been AI-analyzed yet.
--
-- This migration:
-- 1. Creates a wrapper function run_ai_screenshot_analyzer() that finds
--    un-analyzed non-work screenshots and calls the edge function for each.
-- 2. Schedules it every 10 minutes via pg_cron.
-- ============================================================================

-- Ensure extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ============================================================================
-- 1. Create wrapper function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.run_ai_screenshot_analyzer()
RETURNS VOID AS $$
DECLARE
  v_base_url TEXT;
  v_auth_key TEXT;
  v_anon_key TEXT := '***ANON_KEY_REMOVED***';
  v_screenshot RECORD;
  v_count INT := 0;
  v_max_per_run INT := 10; -- Process up to 10 screenshots per cron run to avoid timeouts
BEGIN
  -- Try service role key first, fall back to anon key
  v_auth_key := current_setting('app.supabase_service_role_key', true);
  IF v_auth_key IS NULL OR v_auth_key = '' THEN
    v_auth_key := v_anon_key;
  END IF;

  v_base_url := current_setting('app.supabase_url', true);
  IF v_base_url IS NULL OR v_base_url = '' THEN
    v_base_url := 'https://fkpiqcxkmrtaetvfgcli.supabase.co';
  END IF;

  -- Find screenshots that:
  -- 1. Were categorized as non-work by the SQL heuristic (process_pending_screenshots)
  -- 2. Haven't been AI-analyzed yet by ai-screenshot-analyzer
  -- 3. Are from the last 24 hours (don't re-process old screenshots)
  FOR v_screenshot IN
    SELECT id, user_id, window_title, app_name
    FROM public.screenshots
    WHERE category IN ('entertainment', 'social_media', 'gaming', 'shopping')
      AND (ai_analysis_status IS NULL OR ai_analysis_status = 'pending')
      AND ai_model_used = 'sql-heuristic'
      AND captured_at >= NOW() - INTERVAL '24 hours'
    ORDER BY captured_at DESC
    LIMIT v_max_per_run
  LOOP
    -- Call ai-screenshot-analyzer edge function for this screenshot
    PERFORM net.http_post(
      url := v_base_url || '/functions/v1/ai-screenshot-analyzer',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_auth_key
      ),
      body := jsonb_build_object(
        'screenshot_id', v_screenshot.id,
        'user_id', v_screenshot.user_id,
        'window_title', v_screenshot.window_title,
        'app_name', v_screenshot.app_name,
        'use_ai', true,
        'create_alerts', true,
        'source', 'cron'
      )
    );

    v_count := v_count + 1;
  END LOOP;

  -- Log the run
  IF v_count > 0 THEN
    INSERT INTO public.system_logs (log_type, message, metadata)
    VALUES (
      'ai_automation',
      'AI screenshot analyzer triggered via pg_cron for ' || v_count || ' screenshots',
      jsonb_build_object(
        'function', 'ai-screenshot-analyzer',
        'trigger', 'cron',
        'screenshots_queued', v_count,
        'timestamp', NOW()
      )
    );
    RAISE NOTICE 'AI screenshot analyzer: queued % screenshots for analysis', v_count;
  ELSE
    RAISE NOTICE 'AI screenshot analyzer: no non-work screenshots pending analysis';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.run_ai_screenshot_analyzer TO service_role;

COMMENT ON FUNCTION public.run_ai_screenshot_analyzer IS
'Finds screenshots flagged as non-work by SQL heuristic and sends them to ai-screenshot-analyzer edge function for deep AI analysis and alert creation.';

-- ============================================================================
-- 2. Remove old cron job if it exists (idempotent)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-screenshot-analyzer-cron') THEN
    PERFORM cron.unschedule('ai-screenshot-analyzer-cron');
  END IF;
END $$;

-- ============================================================================
-- 3. Schedule ai-screenshot-analyzer every 10 minutes
-- ============================================================================
SELECT cron.schedule(
  'ai-screenshot-analyzer-cron',
  '*/10 * * * *',
  'SELECT public.run_ai_screenshot_analyzer();'
);

-- ============================================================================
-- 4. Log migration
-- ============================================================================
INSERT INTO public.system_logs (log_type, message, metadata)
VALUES (
  'migration',
  'Scheduled ai-screenshot-analyzer edge function via pg_cron',
  jsonb_build_object(
    'migration_file', '20260207_schedule_ai_screenshot_analyzer.sql',
    'schedule', '*/10 * * * * (every 10 minutes)',
    'function', 'run_ai_screenshot_analyzer',
    'purpose', 'Deep AI analysis + alert creation for non-work screenshots',
    'models', jsonb_build_object('text', 'Qwen/Qwen3-32B', 'vision', 'Qwen/Qwen2.5-VL-7B-Instruct'),
    'timestamp', NOW()
  )
);

DO $$
BEGIN
  RAISE NOTICE 'AI screenshot analyzer cron job scheduled: every 10 minutes';
END $$;
