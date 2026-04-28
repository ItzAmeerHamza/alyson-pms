-- ============================================================
-- System Health Alerts
-- Runs every 30 minutes; emails all admins when a check fails.
-- ============================================================

-- 1. Helper: get recent cron job status (used by both health page and this alert fn)
CREATE OR REPLACE FUNCTION public.get_cron_job_status(p_jobname TEXT)
RETURNS TABLE(
  jobname      TEXT,
  status       TEXT,
  return_message TEXT,
  start_time   TIMESTAMPTZ,
  end_time     TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    jr.jobid::text AS jobname,
    jr.status,
    jr.return_message,
    jr.start_time,
    jr.end_time
  FROM cron.job j
  JOIN cron.job_run_details jr ON j.jobid = jr.jobid
  WHERE j.jobname = p_jobname
  ORDER BY jr.end_time DESC NULLS LAST
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_cron_job_status(TEXT) TO service_role, authenticated;


-- 2. Helper: get recent pg_net HTTP stats (used by health page)
CREATE OR REPLACE FUNCTION public.get_recent_http_stats(p_since TIMESTAMPTZ)
RETURNS TABLE(
  total_requests   BIGINT,
  success_requests BIGINT,
  failed_requests  BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    COUNT(*)                                          AS total_requests,
    COUNT(*) FILTER (WHERE status_code BETWEEN 200 AND 299) AS success_requests,
    COUNT(*) FILTER (WHERE status_code < 200 OR status_code >= 300 OR status_code IS NULL) AS failed_requests
  FROM net._http_response
  WHERE created > p_since;
$$;

GRANT EXECUTE ON FUNCTION public.get_recent_http_stats(TIMESTAMPTZ) TO service_role, authenticated;


-- 3. Main health alert function
CREATE OR REPLACE FUNCTION public.run_system_health_alert()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_service_key TEXT;
  v_base_url    TEXT;
  v_resend_key  TEXT;
  v_health      JSONB;
  v_issues      JSONB := '[]'::jsonb;
  v_failed_count INT := 0;
  v_warn_count  INT := 0;
  v_check       JSONB;
  v_admin       RECORD;
  v_subject     TEXT;
  v_html_body   TEXT;
  v_rows_text   TEXT := '';
  v_status_emoji TEXT;
  v_http_id     BIGINT;
BEGIN
  -- Get credentials
  SELECT value INTO v_service_key FROM public.system_config WHERE key = 'supabase_service_role_key';
  SELECT value INTO v_base_url     FROM public.system_config WHERE key = 'supabase_url';
  SELECT value INTO v_resend_key   FROM public.system_config WHERE key = 'resend_api_key';

  IF v_service_key IS NULL OR v_base_url IS NULL THEN
    RAISE WARNING '[system-health-alert] Missing supabase credentials – skipping';
    RETURN;
  END IF;

  -- Call the system-health edge function
  SELECT net.http_post(
    url     := v_base_url || '/functions/v1/system-health',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body    := '{}'::jsonb
  ) INTO v_http_id;

  -- Wait briefly for pg_net to complete (it's async, so we use a small sleep)
  PERFORM pg_sleep(8);

  -- Read the response
  SELECT content::jsonb
  INTO v_health
  FROM net._http_response
  WHERE id = v_http_id;

  IF v_health IS NULL THEN
    RAISE NOTICE '[system-health-alert] Could not retrieve health check response';
    RETURN;
  END IF;

  -- Count failures and warnings
  FOR v_check IN SELECT * FROM jsonb_array_elements(v_health->'checks')
  LOOP
    IF (v_check->>'status') = 'failed' THEN
      v_failed_count := v_failed_count + 1;
      v_issues := v_issues || v_check;
    ELSIF (v_check->>'status') = 'warn' THEN
      v_warn_count := v_warn_count + 1;
      v_issues := v_issues || v_check;
    END IF;
  END LOOP;

  -- Only alert if there are problems
  IF v_failed_count = 0 AND v_warn_count = 0 THEN
    RAISE NOTICE '[system-health-alert] All systems healthy – no alert needed';
    RETURN;
  END IF;

  -- Guard: don't resend if we already sent an alert in the last 2 hours for the same severity
  IF EXISTS (
    SELECT 1 FROM public.system_logs
    WHERE log_type = 'health_alert_sent'
      AND created_at >= NOW() - INTERVAL '2 hours'
      AND metadata->>'failed_count' = v_failed_count::text
  ) THEN
    RAISE NOTICE '[system-health-alert] Duplicate alert suppressed (already sent in last 2h)';
    RETURN;
  END IF;

  -- If no Resend key, just log and return
  IF v_resend_key IS NULL OR v_resend_key = '' THEN
    INSERT INTO public.system_logs (log_type, message, metadata)
    VALUES ('health_alert_no_key',
            format('Health issues found (%s failed, %s warn) but no resend_api_key configured', v_failed_count, v_warn_count),
            jsonb_build_object('issues', v_issues));
    RETURN;
  END IF;

  -- Build HTML rows for the issues
  FOR v_check IN SELECT * FROM jsonb_array_elements(v_issues)
  LOOP
    v_status_emoji := CASE (v_check->>'status')
      WHEN 'failed' THEN '🔴'
      WHEN 'warn'   THEN '🟡'
      ELSE '⚪'
    END;
    v_rows_text := v_rows_text || format(
      '<tr style="border-bottom:1px solid #f0f0f0"><td style="padding:8px 12px;font-weight:600">%s %s</td><td style="padding:8px 12px;color:#555">%s</td></tr>',
      v_status_emoji,
      v_check->>'name',
      v_check->>'message'
    );
  END LOOP;

  v_subject := format('[TimeFlow] System Alert: %s issue(s) detected', v_failed_count + v_warn_count);
  v_html_body := format(
    '<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px">
      <div style="background:%s;color:white;padding:20px 24px;border-radius:10px 10px 0 0">
        <h2 style="margin:0;font-size:18px">⚠️ TimeFlow System Health Alert</h2>
        <p style="margin:6px 0 0;opacity:0.85;font-size:14px">%s failed · %s warnings · Checked %s UTC</p>
      </div>
      <table style="width:100%%;border-collapse:collapse;background:#fff;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px">
        <thead><tr style="background:#f8f8f8"><th style="padding:8px 12px;text-align:left;font-size:12px;color:#888;font-weight:600">CHECK</th><th style="padding:8px 12px;text-align:left;font-size:12px;color:#888;font-weight:600">STATUS</th></tr></thead>
        <tbody>%s</tbody>
      </table>
      <p style="font-size:12px;color:#999;margin-top:20px">
        This alert was automatically sent by TimeFlow. View the full status at
        <a href="https://worktime.ebdaadt.com/admin/system-health">System Health Dashboard</a>.
      </p>
    </body></html>',
    CASE WHEN v_failed_count > 0 THEN '#dc2626' ELSE '#d97706' END,
    v_failed_count, v_warn_count,
    TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI'),
    v_rows_text
  );

  -- Send email to every admin user in each organization
  FOR v_admin IN
    SELECT DISTINCT u.email, u.full_name
    FROM public.users u
    WHERE u.role IN ('admin', 'manager')
      AND u.email IS NOT NULL
      AND u.is_active = true
  LOOP
    BEGIN
      PERFORM net.http_post(
        url     := 'https://api.resend.com/emails',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || v_resend_key
        ),
        body    := jsonb_build_object(
          'from',    'TimeFlow Alerts <alerts@ebdaadt.com>',
          'to',      ARRAY[v_admin.email],
          'subject', v_subject,
          'html',    v_html_body
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[system-health-alert] Failed to send email to %: %', v_admin.email, SQLERRM;
    END;
  END LOOP;

  -- Log that we sent
  INSERT INTO public.system_logs (log_type, message, metadata)
  VALUES ('health_alert_sent',
          format('Health alert emailed (%s failed, %s warn)', v_failed_count, v_warn_count),
          jsonb_build_object(
            'failed_count', v_failed_count,
            'warn_count',   v_warn_count,
            'issues',       v_issues,
            'checked_at',   NOW()
          ));

  RAISE NOTICE '[system-health-alert] Alert sent to all admins (%s failed, %s warn)', v_failed_count, v_warn_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_system_health_alert() TO service_role;


-- 4. Schedule the alert job every 30 minutes
SELECT cron.unschedule('system-health-alert') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'system-health-alert'
);

SELECT cron.schedule(
  'system-health-alert',
  '*/30 * * * *',  -- every 30 minutes
  $$SELECT public.run_system_health_alert();$$
);


-- 5. Log the migration
INSERT INTO public.system_logs (log_type, message, metadata)
VALUES (
  'migration',
  'system-health-alert cron job installed',
  jsonb_build_object(
    'migration',   '20260311_system_health_alerts',
    'schedule',    '*/30 * * * *',
    'description', 'Checks all systems every 30 min and emails admins on failure'
  )
);
