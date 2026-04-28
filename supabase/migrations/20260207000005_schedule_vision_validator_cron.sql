-- ============================================================================
-- Schedule Vision Validator Edge Function via pg_cron
-- ============================================================================
-- The vision-validator edge function performs perceptual hash (dHash) duplicate
-- detection on screenshots. It was the ONLY active duplicate detection mechanism
-- but had NO cron job scheduling it, so duplicates were never detected.
--
-- This migration:
-- 1. Creates a wrapper function run_vision_validator() that calls the
--    vision-validator edge function via pg_net.http_post.
-- 2. Schedules it every 10 minutes via pg_cron.
-- ============================================================================

-- Ensure extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ============================================================================
-- 1. Create wrapper function to call vision-validator edge function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.run_vision_validator()
RETURNS VOID AS $$
DECLARE
  v_base_url TEXT;
  v_auth_key TEXT;
  -- Anon key fallback (same pattern as run_ai_employee_analysis)
  v_anon_key TEXT := '***ANON_KEY_REMOVED***';
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

  -- Check if there are pending screenshots before calling
  IF NOT EXISTS (
    SELECT 1 FROM public.screenshots
    WHERE needs_vision_validation = true
      AND vision_validated_at IS NULL
      AND image_url IS NOT NULL
    LIMIT 1
  ) THEN
    RAISE NOTICE 'No screenshots pending vision validation – skipping';
    RETURN;
  END IF;

  RAISE NOTICE 'Calling vision-validator edge function...';

  PERFORM net.http_post(
    url := v_base_url || '/functions/v1/vision-validator',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_auth_key
    ),
    body := jsonb_build_object('source', 'cron')
  );

  -- Log the call
  INSERT INTO public.system_logs (log_type, message, metadata)
  VALUES (
    'ai_automation',
    'Vision validator triggered via pg_cron',
    jsonb_build_object(
      'function', 'vision-validator',
      'trigger', 'cron',
      'timestamp', NOW()
    )
  );

  RAISE NOTICE 'Vision validator edge function called successfully';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.run_vision_validator TO service_role;

COMMENT ON FUNCTION public.run_vision_validator IS
'Calls the vision-validator edge function via pg_net for perceptual hash duplicate detection. Skips if no screenshots are pending.';

-- ============================================================================
-- 2. Remove old vision-validator cron job if it exists (idempotent)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vision-validator-cron') THEN
    PERFORM cron.unschedule('vision-validator-cron');
  END IF;
END $$;

-- ============================================================================
-- 3. Schedule vision-validator every 10 minutes
-- ============================================================================
SELECT cron.schedule(
  'vision-validator-cron',
  '*/10 * * * *',
  'SELECT public.run_vision_validator();'
);

-- ============================================================================
-- 4. Log migration
-- ============================================================================
INSERT INTO public.system_logs (log_type, message, metadata)
VALUES (
  'migration',
  'Scheduled vision-validator edge function via pg_cron',
  jsonb_build_object(
    'migration_file', '20260207_schedule_vision_validator_cron.sql',
    'schedule', '*/10 * * * * (every 10 minutes)',
    'function', 'run_vision_validator',
    'purpose', 'Perceptual hash duplicate detection for screenshots',
    'timestamp', NOW()
  )
);

DO $$
BEGIN
  RAISE NOTICE 'Vision validator cron job scheduled: every 10 minutes';
END $$;
