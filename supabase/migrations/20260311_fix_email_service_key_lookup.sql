-- ============================================================================
-- Fix email wrapper functions to read service_role_key from system_config
-- ============================================================================
-- Root cause: send_email_reports_per_org() and send_daily_hours_alert_per_org()
-- only read from current_setting('app.supabase_service_role_key') which is not
-- set in production. Meanwhile run_ai_employee_analysis() works because it
-- reads from public.system_config first. Apply the same pattern here.
-- ============================================================================

-- 1. Fix send_email_reports_per_org
CREATE OR REPLACE FUNCTION public.send_email_reports_per_org(report_type TEXT)
RETURNS VOID AS $$
DECLARE
  v_org         RECORD;
  v_org_count   INTEGER := 0;
  v_base_url    TEXT;
  v_service_key TEXT;
BEGIN
  -- Try system_config table first (same pattern as run_ai_employee_analysis)
  SELECT value INTO v_service_key
  FROM public.system_config
  WHERE key = 'supabase_service_role_key';

  IF v_service_key IS NULL OR v_service_key = '' THEN
    v_service_key := current_setting('app.supabase_service_role_key', true);
  END IF;

  IF v_service_key IS NULL OR v_service_key = '' THEN
    RAISE WARNING 'Service role key not found in system_config or app settings – cannot send % reports', report_type;
    INSERT INTO public.system_logs (log_type, message, metadata)
    VALUES ('email_error', 'send_email_reports_per_org failed: service_role_key not found',
            jsonb_build_object('report_type', report_type, 'timestamp', NOW()));
    RETURN;
  END IF;

  -- Base URL
  SELECT value INTO v_base_url
  FROM public.system_config
  WHERE key = 'supabase_url';

  IF v_base_url IS NULL OR v_base_url = '' THEN
    v_base_url := current_setting('app.supabase_url', true);
  END IF;

  IF v_base_url IS NULL OR v_base_url = '' THEN
    v_base_url := 'https://fkpiqcxkmrtaetvfgcli.supabase.co';
  END IF;

  FOR v_org IN
    SELECT id, name FROM public.organizations WHERE is_active = true ORDER BY created_at
  LOOP
    v_org_count := v_org_count + 1;
    RAISE NOTICE 'Sending % report for org: % (%)', report_type, v_org.name, v_org.id;

    PERFORM net.http_post(
      url     := v_base_url || '/functions/v1/email-reports',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body    := jsonb_build_object(
        'organization_id', v_org.id,
        'report_type', report_type
      )
    );

    PERFORM pg_sleep(1);
  END LOOP;

  IF v_org_count = 0 THEN
    RAISE NOTICE 'No organizations found – sending global % report', report_type;
    PERFORM net.http_post(
      url     := v_base_url || '/functions/v1/email-reports',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body    := jsonb_build_object('report_type', report_type)
    );
  END IF;

  INSERT INTO public.system_logs (log_type, message, metadata)
  VALUES ('email_report', format('send_email_reports_per_org(%s) completed', report_type),
          jsonb_build_object('orgs_processed', v_org_count, 'report_type', report_type, 'timestamp', NOW()));

  RAISE NOTICE 'send_email_reports_per_org(%) complete: % orgs processed', report_type, v_org_count;
END;
$$ LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = 'public';

GRANT EXECUTE ON FUNCTION public.send_email_reports_per_org(TEXT) TO service_role;


-- 2. Fix send_daily_hours_alert_per_org
CREATE OR REPLACE FUNCTION public.send_daily_hours_alert_per_org()
RETURNS VOID AS $$
DECLARE
  v_org         RECORD;
  v_org_count   INTEGER := 0;
  v_base_url    TEXT;
  v_service_key TEXT;
BEGIN
  -- Try system_config table first (same pattern as run_ai_employee_analysis)
  SELECT value INTO v_service_key
  FROM public.system_config
  WHERE key = 'supabase_service_role_key';

  IF v_service_key IS NULL OR v_service_key = '' THEN
    v_service_key := current_setting('app.supabase_service_role_key', true);
  END IF;

  IF v_service_key IS NULL OR v_service_key = '' THEN
    RAISE WARNING 'Service role key not found in system_config or app settings – cannot send daily hours alert';
    INSERT INTO public.system_logs (log_type, message, metadata)
    VALUES ('email_error', 'send_daily_hours_alert_per_org failed: service_role_key not found',
            jsonb_build_object('timestamp', NOW()));
    RETURN;
  END IF;

  -- Base URL
  SELECT value INTO v_base_url
  FROM public.system_config
  WHERE key = 'supabase_url';

  IF v_base_url IS NULL OR v_base_url = '' THEN
    v_base_url := current_setting('app.supabase_url', true);
  END IF;

  IF v_base_url IS NULL OR v_base_url = '' THEN
    v_base_url := 'https://fkpiqcxkmrtaetvfgcli.supabase.co';
  END IF;

  FOR v_org IN
    SELECT id, name FROM public.organizations WHERE is_active = true ORDER BY created_at
  LOOP
    v_org_count := v_org_count + 1;
    RAISE NOTICE 'Sending daily hours alert for org: % (%)', v_org.name, v_org.id;

    PERFORM net.http_post(
      url     := v_base_url || '/functions/v1/daily-hours-alert',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body    := jsonb_build_object('organization_id', v_org.id)
    );

    PERFORM pg_sleep(1);
  END LOOP;

  IF v_org_count = 0 THEN
    RAISE NOTICE 'No organizations found – sending global daily hours alert';
    PERFORM net.http_post(
      url     := v_base_url || '/functions/v1/daily-hours-alert',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body    := '{}'::jsonb
    );
  END IF;

  INSERT INTO public.system_logs (log_type, message, metadata)
  VALUES ('daily_hours_alert', 'send_daily_hours_alert_per_org completed',
          jsonb_build_object('orgs_processed', v_org_count, 'timestamp', NOW()));

  RAISE NOTICE 'send_daily_hours_alert_per_org complete: % org(s) processed', v_org_count;
END;
$$ LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = 'public';

GRANT EXECUTE ON FUNCTION public.send_daily_hours_alert_per_org() TO service_role;


-- 3. Also fix the URL path for email reports
-- The old code built URL as: /functions/v1/email-reports/send-daily-report
-- The fixed edge function now handles POST to /functions/v1/email-reports
-- with report_type in the body (the path remapping fix from v49)
-- The new function above already sends to /functions/v1/email-reports with body
-- containing report_type, which matches the deployed edge function.

-- Log migration
DO $$
BEGIN
  RAISE NOTICE '✅ Fixed email wrapper functions to read service_role_key from system_config table';
  RAISE NOTICE '   - send_email_reports_per_org: now reads system_config first, logs failures';
  RAISE NOTICE '   - send_daily_hours_alert_per_org: now reads system_config first, logs failures';
  RAISE NOTICE '   - Both now use /functions/v1/email-reports base path (matches v49 edge function)';
END $$;
