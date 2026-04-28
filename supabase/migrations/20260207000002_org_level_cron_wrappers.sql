-- ============================================================================
-- STEP 6: Per-Organization Cron Wrappers
-- ============================================================================
-- DEPLOY LAST: Only apply this migration AFTER all edge functions have been
-- deployed with optional organization_id support (Steps 1-5).
--
-- This migration:
-- 1. Creates send_email_reports_per_org() – iterates active orgs and calls
--    the email-reports edge function once per org.
-- 2. Creates run_insights_generator_per_org() – iterates active orgs and
--    calls generate_employee_insights() once per org.
-- 3. Reschedules existing cron jobs to use the per-org wrappers.
-- 4. Keeps backward compatibility: if no organizations exist, falls back to
--    a single global call (no org_id).
-- ============================================================================

-- Ensure extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================================
-- 1. Per-org email report wrapper
-- ============================================================================
CREATE OR REPLACE FUNCTION public.send_email_reports_per_org(report_type TEXT)
RETURNS VOID AS $$
DECLARE
  v_org RECORD;
  v_org_count INTEGER := 0;
  v_base_url TEXT;
  v_service_key TEXT;
BEGIN
  -- Read settings
  v_base_url := current_setting('app.supabase_url', true);
  v_service_key := current_setting('app.supabase_service_role_key', true);

  -- Fallback: if settings are not available, use env-style defaults
  IF v_base_url IS NULL OR v_base_url = '' THEN
    v_base_url := 'https://fkpiqcxkmrtaetvfgcli.supabase.co';
  END IF;

  IF v_service_key IS NULL OR v_service_key = '' THEN
    RAISE WARNING 'app.supabase_service_role_key not set – cannot send reports';
    RETURN;
  END IF;

  -- Iterate active organizations
  FOR v_org IN
    SELECT id, name FROM public.organizations WHERE is_active = true ORDER BY created_at
  LOOP
    v_org_count := v_org_count + 1;
    RAISE NOTICE 'Sending % report for org: % (%)', report_type, v_org.name, v_org.id;

    PERFORM net.http_post(
      url := v_base_url || '/functions/v1/email-reports/send-' || report_type || '-report',
      headers := format(
        '{"Content-Type":"application/json","Authorization":"Bearer %s"}',
        v_service_key
      )::jsonb,
      body := format('{"organization_id":"%s"}', v_org.id)::jsonb
    );

    -- Rate-limit: 1 second between org calls
    PERFORM pg_sleep(1);
  END LOOP;

  -- Fallback: if no organizations exist, send one global report (backward compat)
  IF v_org_count = 0 THEN
    RAISE NOTICE 'No organizations found – sending global % report', report_type;
    PERFORM net.http_post(
      url := v_base_url || '/functions/v1/email-reports/send-' || report_type || '-report',
      headers := format(
        '{"Content-Type":"application/json","Authorization":"Bearer %s"}',
        v_service_key
      )::jsonb,
      body := '{}'::jsonb
    );
  END IF;

  RAISE NOTICE 'send_email_reports_per_org(%) complete: % orgs processed', report_type, v_org_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.send_email_reports_per_org TO service_role;

COMMENT ON FUNCTION public.send_email_reports_per_org IS
'Iterates active organizations and calls email-reports edge function per org. Falls back to global call if no orgs exist.';

-- ============================================================================
-- 2. Per-org insights generator wrapper
-- ============================================================================
CREATE OR REPLACE FUNCTION public.run_insights_generator_per_org()
RETURNS VOID AS $$
DECLARE
  v_org RECORD;
  v_org_count INTEGER := 0;
  result RECORD;
BEGIN
  FOR v_org IN
    SELECT id, name FROM public.organizations WHERE is_active = true ORDER BY created_at
  LOOP
    v_org_count := v_org_count + 1;
    RAISE NOTICE 'Generating insights for org: % (%)', v_org.name, v_org.id;

    SELECT * INTO result FROM public.generate_employee_insights('day', NULL);

    -- Log per-org result
    INSERT INTO public.system_logs (log_type, message, metadata)
    VALUES (
      'ai_automation',
      format('Employee insights generated for org %s', v_org.name),
      jsonb_build_object(
        'organization_id', v_org.id,
        'organization_name', v_org.name,
        'users_processed', result.users_processed,
        'insights_created', result.insights_created,
        'insights_updated', result.insights_updated,
        'elapsed_ms', result.elapsed_ms,
        'timestamp', NOW()
      )
    );
  END LOOP;

  -- Fallback: if no orgs, run global
  IF v_org_count = 0 THEN
    RAISE NOTICE 'No organizations found – running global insights generator';
    SELECT * INTO result FROM public.generate_employee_insights('day', NULL);
  END IF;

  RAISE NOTICE 'run_insights_generator_per_org complete: % orgs', v_org_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.run_insights_generator_per_org TO service_role;

COMMENT ON FUNCTION public.run_insights_generator_per_org IS
'Iterates active organizations and generates employee insights per org.';

-- ============================================================================
-- 3. Reschedule email report cron jobs to use per-org wrappers
-- ============================================================================

-- Remove old v2 jobs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-email-report-v2') THEN
    PERFORM cron.unschedule('daily-email-report-v2');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-email-report-v2') THEN
    PERFORM cron.unschedule('weekly-email-report-v2');
  END IF;
  -- Remove v3 if re-running migration
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-email-report-v3') THEN
    PERFORM cron.unschedule('daily-email-report-v3');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-email-report-v3') THEN
    PERFORM cron.unschedule('weekly-email-report-v3');
  END IF;
END $$;

-- Daily Email Report (per-org) – Every day at 7 PM UTC (10 PM Saudi Arabia)
SELECT cron.schedule(
  'daily-email-report-v3',
  '0 19 * * *',
  $$SELECT public.send_email_reports_per_org('daily');$$
);

-- Weekly Email Report (per-org) – Every Thursday at 7 PM UTC (10 PM Saudi Arabia)
SELECT cron.schedule(
  'weekly-email-report-v3',
  '0 19 * * 4',
  $$SELECT public.send_email_reports_per_org('weekly');$$
);

-- ============================================================================
-- 4. Log migration
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Per-org cron wrappers created and scheduled';
  RAISE NOTICE 'Daily report (per-org): 0 19 * * * → send_email_reports_per_org(daily)';
  RAISE NOTICE 'Weekly report (per-org): 0 19 * * 4 → send_email_reports_per_org(weekly)';
END $$;
