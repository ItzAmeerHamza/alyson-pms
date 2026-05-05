-- Canonical per-screenshot JSON from DeepSeek (see ai-screenshot-analyzer: screen_analysis).

ALTER TABLE public.screenshots
  ADD COLUMN IF NOT EXISTS screen_analysis JSONB;

COMMENT ON COLUMN public.screenshots.screen_analysis IS
  'Canonical workforce analytics JSON from DeepSeek (device, task alignment, distraction_risk, etc.). Populated by ai-screenshot-analyzer.';

CREATE INDEX IF NOT EXISTS idx_screenshots_screen_analysis_null
  ON public.screenshots (captured_at DESC)
  WHERE screen_analysis IS NULL;

-- Queue screenshots missing canonical JSON (cheap DeepSeek path: canonical_screen_analysis_only).
CREATE OR REPLACE FUNCTION public.run_canonical_screen_analysis_queue()
RETURNS VOID AS $$
DECLARE
  v_base_url TEXT;
  v_auth_key TEXT;
  v_anon_key TEXT := '***ANON_KEY_REMOVED***';
  v_row RECORD;
  v_count INT := 0;
  v_max_per_run INT := 20;
BEGIN
  v_auth_key := current_setting('app.supabase_service_role_key', true);
  IF v_auth_key IS NULL OR v_auth_key = '' THEN
    v_auth_key := v_anon_key;
  END IF;

  v_base_url := current_setting('app.supabase_url', true);
  IF v_base_url IS NULL OR v_base_url = '' THEN
    v_base_url := 'https://fkpiqcxkmrtaetvfgcli.supabase.co';
  END IF;

  FOR v_row IN
    SELECT id
    FROM public.screenshots
    WHERE screen_analysis IS NULL
      AND captured_at >= NOW() - INTERVAL '72 hours'
    ORDER BY captured_at DESC
    LIMIT v_max_per_run
  LOOP
    PERFORM net.http_post(
      url := v_base_url || '/functions/v1/ai-screenshot-analyzer',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_auth_key
      ),
      body := jsonb_build_object(
        'screenshot_id', v_row.id,
        'canonical_screen_analysis_only', true,
        'use_ai', false,
        'create_alerts', false,
        'source', 'canonical_screen_analysis_cron'
      )
    );
    v_count := v_count + 1;
  END LOOP;

  IF v_count > 0 THEN
    INSERT INTO public.system_logs (log_type, message, metadata)
    VALUES (
      'ai_automation',
      'Canonical screen_analysis queued for ' || v_count || ' screenshots',
      jsonb_build_object(
        'function', 'run_canonical_screen_analysis_queue',
        'screenshots_queued', v_count,
        'timestamp', NOW()
      )
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.run_canonical_screen_analysis_queue() IS
  'Queues ai-screenshot-analyzer (canonical_screen_analysis_only) for recent screenshots missing screen_analysis.';

GRANT EXECUTE ON FUNCTION public.run_canonical_screen_analysis_queue() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'canonical-screen-analysis-queue') THEN
    PERFORM cron.unschedule('canonical-screen-analysis-queue');
  END IF;
END $$;

SELECT cron.schedule(
  'canonical-screen-analysis-queue',
  '*/15 * * * *',
  'SELECT public.run_canonical_screen_analysis_queue();'
);

NOTIFY pgrst, 'reload schema';
