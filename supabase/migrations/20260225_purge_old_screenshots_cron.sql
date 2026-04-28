-- ============================================================================
-- Migration: Purge Old Screenshots via Edge Function + pg_cron
-- Purpose:   Delete screenshots older than 30 days from both Storage and DB.
--            Uses Edge Function because Supabase blocks direct DELETE from
--            storage.objects (storage.protect_delete trigger).
-- Schedule:  Daily at 3 AM UTC via pg_cron → pg_net → Edge Function
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ============================================================================
-- STEP 1: Remove old cron job and function if re-running migration
-- ============================================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'screenshot-storage-purge') THEN
    PERFORM cron.unschedule('screenshot-storage-purge');
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.purge_old_screenshots(int);

-- ============================================================================
-- STEP 2: Create wrapper function that calls Edge Function via pg_net
-- ============================================================================
CREATE OR REPLACE FUNCTION public.run_screenshot_cleanup()
RETURNS VOID AS $$
DECLARE
  v_base_url TEXT;
  v_auth_key TEXT;
  v_anon_key TEXT := '***ANON_KEY_REMOVED***';
BEGIN
  v_auth_key := current_setting('app.supabase_service_role_key', true);
  IF v_auth_key IS NULL OR v_auth_key = '' THEN
    v_auth_key := v_anon_key;
  END IF;

  v_base_url := current_setting('app.supabase_url', true);
  IF v_base_url IS NULL OR v_base_url = '' THEN
    v_base_url := 'https://fkpiqcxkmrtaetvfgcli.supabase.co';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.screenshots
    WHERE captured_at < NOW() - INTERVAL '30 days'
      AND file_path IS NOT NULL
    LIMIT 1
  ) THEN
    RAISE NOTICE 'No screenshots older than 30 days – skipping cleanup';
    RETURN;
  END IF;

  RAISE NOTICE 'Calling cleanup-old-screenshots edge function...';

  PERFORM net.http_post(
    url := v_base_url || '/functions/v1/cleanup-old-screenshots',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_auth_key
    ),
    body := jsonb_build_object('retention_days', 30, 'source', 'cron')
  );

  INSERT INTO public.system_logs (log_type, message, metadata)
  VALUES (
    'storage_cleanup',
    'Screenshot cleanup edge function triggered via pg_cron',
    jsonb_build_object(
      'function', 'cleanup-old-screenshots',
      'trigger', 'cron',
      'retention_days', 30,
      'timestamp', NOW()
    )
  );

  RAISE NOTICE 'Screenshot cleanup edge function called successfully';
END;
$$ LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = 'public';

GRANT EXECUTE ON FUNCTION public.run_screenshot_cleanup TO service_role;

-- ============================================================================
-- STEP 3: Schedule daily cleanup at 3 AM UTC
-- ============================================================================
SELECT cron.schedule(
  'screenshot-storage-purge',
  '0 3 * * *',
  'SELECT public.run_screenshot_cleanup();'
);

-- ============================================================================
-- STEP 4: Log the migration
-- ============================================================================
INSERT INTO public.system_logs (log_type, message, metadata)
VALUES (
  'migration',
  'Screenshot storage purge cron job created (Edge Function approach)',
  jsonb_build_object(
    'migration_file', '20260225_purge_old_screenshots_cron.sql',
    'edge_function', 'cleanup-old-screenshots',
    'retention_days', 30,
    'schedule', '0 3 * * * (daily at 3 AM UTC)',
    'batch_size', 200,
    'max_per_run', 5000
  )
);
