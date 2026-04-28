-- ============================================================================
-- Daily Hours Alert – Cron Wrapper
-- ============================================================================
-- Calls the `daily-hours-alert` edge function once per active organization
-- (or once globally if no organizations exist).
--
-- Schedule: every weekday at 8 PM UTC (11 PM AST / Arabia Standard Time).
-- Adjust the cron expression to match your organization's working hours.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================================
-- Wrapper function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.send_daily_hours_alert_per_org()
RETURNS VOID AS $$
DECLARE
  v_org         RECORD;
  v_org_count   INTEGER := 0;
  v_base_url    TEXT;
  v_service_key TEXT;
BEGIN
  v_base_url    := current_setting('app.supabase_url', true);
  v_service_key := current_setting('app.supabase_service_role_key', true);

  -- Hard-coded fallback URL (no secret – project URL is public)
  IF v_base_url IS NULL OR v_base_url = '' THEN
    v_base_url := 'https://fkpiqcxkmrtaetvfgcli.supabase.co';
  END IF;

  IF v_service_key IS NULL OR v_service_key = '' THEN
    RAISE WARNING 'app.supabase_service_role_key not set – cannot send daily hours alert';
    RETURN;
  END IF;

  -- Iterate active organizations
  FOR v_org IN
    SELECT id, name
    FROM   public.organizations
    WHERE  is_active = true
    ORDER  BY created_at
  LOOP
    v_org_count := v_org_count + 1;
    RAISE NOTICE 'Sending daily hours alert for org: % (%)', v_org.name, v_org.id;

    PERFORM net.http_post(
      url     := v_base_url || '/functions/v1/daily-hours-alert',
      headers := format(
        '{"Content-Type":"application/json","Authorization":"Bearer %s"}',
        v_service_key
      )::jsonb,
      body    := format('{"organization_id":"%s"}', v_org.id)::jsonb
    );

    -- Rate-limit: 1 second between org calls to avoid overwhelming the function
    PERFORM pg_sleep(1);
  END LOOP;

  -- Fallback: no organizations → send a single global call
  IF v_org_count = 0 THEN
    RAISE NOTICE 'No organizations found – sending global daily hours alert';
    PERFORM net.http_post(
      url     := v_base_url || '/functions/v1/daily-hours-alert',
      headers := format(
        '{"Content-Type":"application/json","Authorization":"Bearer %s"}',
        v_service_key
      )::jsonb,
      body    := '{}'::jsonb
    );
  END IF;

  RAISE NOTICE 'send_daily_hours_alert_per_org complete: % org(s) processed', v_org_count;
END;
$$ LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = 'public';

GRANT EXECUTE ON FUNCTION public.send_daily_hours_alert_per_org() TO service_role;

COMMENT ON FUNCTION public.send_daily_hours_alert_per_org IS
'Iterates active organizations and calls the daily-hours-alert edge function for each one. Falls back to a single global call if no organizations exist.';

-- ============================================================================
-- Schedule the cron job
-- ============================================================================

-- Remove any previous version of this job before (re-)creating
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-hours-alert') THEN
    PERFORM cron.unschedule('daily-hours-alert');
  END IF;
END $$;

-- Every weekday (Mon–Fri) at 8 PM UTC = 11 PM Arabia Standard Time
-- Change '0 20 * * 1-5' to '0 20 * * *' if you work on weekends too.
SELECT cron.schedule(
  'daily-hours-alert',
  '0 20 * * 1-5',
  $$SELECT public.send_daily_hours_alert_per_org();$$
);

-- ============================================================================
-- Log
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ daily-hours-alert cron job scheduled';
  RAISE NOTICE '   Job name : daily-hours-alert';
  RAISE NOTICE '   Schedule : 0 20 * * 1-5  (Mon–Fri 20:00 UTC / 23:00 AST)';
  RAISE NOTICE '   Function : send_daily_hours_alert_per_org()';
END $$;
