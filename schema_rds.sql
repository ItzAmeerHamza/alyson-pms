--
-- RDS preamble (auto-generated) — stub auth + roles Supabase expects
--
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULL::uuid $$;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$roles$;



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."_extract_domain"("u" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case
    when u is null or btrim(u)='' then null
    else lower(replace(split_part(split_part(u, '://', 2), '/', 1), 'www.', ''))
  end
$$;


ALTER FUNCTION "public"."_extract_domain"("u" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_close_stale_sessions"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_closed_count integer := 0;
  v_no_screenshot_count integer := 0;
  v_max_duration_count integer := 0;
  v_rec record;
  v_last_screenshot timestamptz;
  v_end_time timestamptz;
BEGIN
  -- Loop through all active sessions (end_time IS NULL)
  FOR v_rec IN
    SELECT id, user_id, start_time, device_id
    FROM public.time_logs
    WHERE end_time IS NULL
      AND status = 'active'
    ORDER BY start_time ASC
  LOOP
    -- Find last screenshot scoped to THIS session
    SELECT MAX(captured_at) INTO v_last_screenshot
    FROM public.screenshots
    WHERE user_id = v_rec.user_id
      AND time_log_id = v_rec.id;

    -- Fallback: screenshots in this session's window only
    IF v_last_screenshot IS NULL THEN
      SELECT MAX(captured_at) INTO v_last_screenshot
      FROM public.screenshots
      WHERE user_id = v_rec.user_id
        AND captured_at >= v_rec.start_time
        AND captured_at <= NOW();
    END IF;

    -- Rule 1: Absolute max duration (10 hours)
    IF v_rec.start_time < NOW() - interval '10 hours' THEN
      IF v_last_screenshot IS NOT NULL AND v_last_screenshot >= v_rec.start_time THEN
        v_end_time := LEAST(
          v_last_screenshot + interval '5 minutes',
          v_rec.start_time + interval '10 hours'
        );
      ELSE
        v_end_time := v_rec.start_time + interval '1 hour';
      END IF;

      -- Hard guarantee
      IF v_end_time < v_rec.start_time THEN
        v_end_time := v_rec.start_time + interval '1 hour';
      END IF;

      UPDATE public.time_logs
      SET end_time = v_end_time,
          status = 'auto_closed'
      WHERE id = v_rec.id
        AND end_time IS NULL;

      v_max_duration_count := v_max_duration_count + 1;
      v_closed_count := v_closed_count + 1;
      CONTINUE;
    END IF;

    -- Rule 2: No screenshot in last 30 minutes (agent likely dead)
    -- Only applies if session has been running for at least 30 minutes
    IF v_rec.start_time < NOW() - interval '30 minutes' THEN
      IF v_last_screenshot IS NULL
         OR v_last_screenshot < NOW() - interval '30 minutes' THEN
        
        IF v_last_screenshot IS NOT NULL AND v_last_screenshot >= v_rec.start_time THEN
          v_end_time := v_last_screenshot + interval '5 minutes';
        ELSE
          v_end_time := v_rec.start_time + interval '30 minutes';
        END IF;

        -- Hard guarantee
        IF v_end_time < v_rec.start_time THEN
          v_end_time := v_rec.start_time + interval '30 minutes';
        END IF;

        UPDATE public.time_logs
        SET end_time = v_end_time,
            status = 'auto_closed'
        WHERE id = v_rec.id
          AND end_time IS NULL;

        v_no_screenshot_count := v_no_screenshot_count + 1;
        v_closed_count := v_closed_count + 1;
        CONTINUE;
      END IF;
    END IF;

  END LOOP;

  RETURN jsonb_build_object(
    'closed_total', v_closed_count,
    'max_duration', v_max_duration_count,
    'no_screenshot', v_no_screenshot_count,
    'run_at', NOW()
  );
END;
$$;


ALTER FUNCTION "public"."auto_close_stale_sessions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_employee_compliance"("target_user_id" "uuid", "target_month" "date") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    user_record RECORD;
    standards_record RECORD;
    result JSON;
    total_hours DECIMAL(10,2) := 0;
    total_days INTEGER := 0;
    required_hours DECIMAL(10,2);
    required_days INTEGER;
    gap_percentage DECIMAL(5,2);
    compliance_status TEXT;
    warning_level TEXT;
BEGIN
    -- Get user info
    SELECT * INTO user_record FROM public.users WHERE id = target_user_id;
    IF NOT FOUND THEN
        RETURN '{"error": "User not found"}';
    END IF;

    -- Get working standards
    SELECT * INTO standards_record FROM public.employee_working_standards 
    WHERE user_id = target_user_id AND is_active = TRUE;
    
    IF NOT FOUND THEN
        -- Create default standards if not exist
        INSERT INTO public.employee_working_standards (user_id, employment_type)
        VALUES (target_user_id, 'hourly')
        RETURNING * INTO standards_record;
    END IF;

    -- Calculate actual hours worked for the month
    SELECT 
        COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, NOW()) - start_time)) / 3600), 0),
        COUNT(DISTINCT DATE(start_time))
    INTO total_hours, total_days
    FROM public.time_logs tl
    WHERE tl.user_id = target_user_id
    AND DATE_TRUNC('month', tl.start_time) = DATE_TRUNC('month', target_month)
    AND tl.end_time IS NOT NULL;

    -- Set requirements based on employment type
    IF standards_record.employment_type = 'hourly' THEN
        required_hours := standards_record.required_hours_monthly;
        gap_percentage := CASE 
            WHEN required_hours > 0 THEN ROUND(((required_hours - total_hours) / required_hours * 100), 2)
            ELSE 0 
        END;
    ELSE
        required_days := standards_record.required_days_monthly;
        gap_percentage := CASE 
            WHEN required_days > 0 THEN ROUND(((required_days - total_days) / required_days::DECIMAL * 100), 2)
            ELSE 0 
        END;
    END IF;

    -- Determine compliance status and warning level
    IF gap_percentage <= 0 THEN
        compliance_status := 'compliant';
        warning_level := 'none';
    ELSIF gap_percentage <= (100 - standards_record.warning_threshold_percentage) THEN
        compliance_status := 'warning';
        warning_level := 'low';
    ELSIF gap_percentage <= 20 THEN
        compliance_status := 'warning';
        warning_level := 'medium';
    ELSE
        compliance_status := 'critical';
        warning_level := 'high';
    END IF;

    -- Build result JSON
    result := json_build_object(
        'user_id', target_user_id,
        'employment_type', standards_record.employment_type,
        'total_hours', total_hours,
        'total_days', total_days,
        'required_hours', required_hours,
        'required_days', required_days,
        'gap_percentage', gap_percentage,
        'compliance_status', compliance_status,
        'warning_level', warning_level,
        'standards', row_to_json(standards_record)
    );

    RETURN result;
END;
$$;


ALTER FUNCTION "public"."calculate_employee_compliance"("target_user_id" "uuid", "target_month" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."calculate_employee_compliance"("target_user_id" "uuid", "target_month" "date") IS 'Calculates compliance metrics for an employee in a given month';



CREATE OR REPLACE FUNCTION "public"."close_user_active_sessions"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  closed_count integer;
BEGIN
  -- Only allow closing your own sessions (defense-in-depth)
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.time_logs
  SET status = 'completed',
      end_time = COALESCE(end_time, NOW())
  WHERE user_id = p_user_id
    AND status = 'active';

  GET DIAGNOSTICS closed_count = ROW_COUNT;
  RETURN closed_count;
END;
$$;


ALTER FUNCTION "public"."close_user_active_sessions"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."close_user_active_sessions"("p_user_id" "uuid", "p_device_id" "text" DEFAULT NULL::"text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  closed_count integer := 0;
  v_rec record;
  v_last_screenshot timestamptz;
  v_end_time timestamptz;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_rec IN
    SELECT id, start_time
    FROM public.time_logs
    WHERE user_id = p_user_id
      AND end_time IS NULL
      AND status = 'active'
      AND (p_device_id IS NULL OR device_id = p_device_id)
  LOOP
    v_last_screenshot := NULL;

    -- Find last screenshot scoped to THIS session's time_log_id
    SELECT MAX(captured_at) INTO v_last_screenshot
    FROM public.screenshots
    WHERE user_id = p_user_id
      AND time_log_id = v_rec.id;

    -- Fallback: screenshots in THIS session's time window only
    IF v_last_screenshot IS NULL THEN
      SELECT MAX(captured_at) INTO v_last_screenshot
      FROM public.screenshots
      WHERE user_id = p_user_id
        AND captured_at >= v_rec.start_time
        AND captured_at <= NOW();
    END IF;

    -- Session started less than 5 min ago: use NOW()
    IF v_rec.start_time > NOW() - interval '5 minutes' THEN
      v_end_time := NOW();
    ELSIF v_last_screenshot IS NOT NULL AND v_last_screenshot >= v_rec.start_time THEN
      v_end_time := LEAST(
        v_last_screenshot + interval '5 minutes',
        v_rec.start_time + interval '10 hours'
      );
    ELSE
      v_end_time := v_rec.start_time + interval '1 hour';
    END IF;

    -- Hard guarantee: end_time must never be before start_time
    IF v_end_time < v_rec.start_time THEN
      v_end_time := v_rec.start_time + interval '1 hour';
    END IF;

    UPDATE public.time_logs
    SET end_time = v_end_time,
        status = 'completed'
    WHERE id = v_rec.id
      AND end_time IS NULL;

    closed_count := closed_count + 1;
  END LOOP;

  RETURN closed_count;
END;
$$;


ALTER FUNCTION "public"."close_user_active_sessions"("p_user_id" "uuid", "p_device_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."configure_service_role_key"("new_service_key" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Set the service role key in PostgreSQL configuration
    PERFORM set_config('app.supabase_service_role_key', new_service_key, false);
    
    -- Log the configuration change (without exposing the key)
    INSERT INTO public.system_logs (log_type, message, metadata) 
    VALUES (
        'security_config',
        'Service role key configuration updated',
        jsonb_build_object(
            'timestamp', NOW(),
            'key_length', length(new_service_key),
            'configured_by', 'migration'
        )
    );
    
    RETURN 'Service role key configured successfully';
END;
$$;


ALTER FUNCTION "public"."configure_service_role_key"("new_service_key" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."configure_service_role_key"("new_service_key" "text") IS 'Securely configure service role key for cron job authentication';



CREATE OR REPLACE FUNCTION "public"."create_compliance_warning"("target_user_id" "uuid", "target_month" "date") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    compliance_data JSON;
    warning_id UUID;
    warning_message TEXT;
    employment_type TEXT;
    gap_percentage DECIMAL(5,2);
    warning_level TEXT;
    required_value DECIMAL(10,2);
    actual_value DECIMAL(10,2);
BEGIN
    -- Get compliance data
    compliance_data := calculate_employee_compliance(target_user_id, target_month);
    
    -- Extract values from JSON
    employment_type := compliance_data->>'employment_type';
    gap_percentage := (compliance_data->>'gap_percentage')::DECIMAL;
    warning_level := compliance_data->>'warning_level';
    
    -- Only create warning if there's an issue
    IF warning_level = 'none' THEN
        RETURN NULL;
    END IF;

    -- Build warning message and values based on employment type
    IF employment_type = 'hourly' THEN
        required_value := (compliance_data->>'required_hours')::DECIMAL;
        actual_value := (compliance_data->>'total_hours')::DECIMAL;
        warning_message := format('Employee has worked only %.1f hours out of required %.1f hours (%.1f%% deficit)',
            actual_value, required_value, gap_percentage);
    ELSE
        required_value := (compliance_data->>'required_days')::DECIMAL;
        actual_value := (compliance_data->>'total_days')::DECIMAL;
        warning_message := format('Employee has worked only %s days out of required %s days (%.1f%% deficit)',
            actual_value::INTEGER, required_value::INTEGER, gap_percentage);
    END IF;

    -- Insert warning
    INSERT INTO public.employee_warnings (
        user_id,
        month_year,
        warning_type,
        severity,
        message,
        required_value,
        actual_value,
        gap_percentage
    ) VALUES (
        target_user_id,
        target_month,
        CASE WHEN employment_type = 'hourly' THEN 'below_hours' ELSE 'below_days' END,
        warning_level,
        warning_message,
        required_value,
        actual_value,
        gap_percentage
    )
    RETURNING id INTO warning_id;

    RETURN warning_id;
END;
$$;


ALTER FUNCTION "public"."create_compliance_warning"("target_user_id" "uuid", "target_month" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_compliance_warning"("target_user_id" "uuid", "target_month" "date") IS 'Creates automatic warnings based on compliance calculations';



CREATE OR REPLACE FUNCTION "public"."create_fraud_alert_notification"("alert_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    alert_record RECORD;
    notification_id UUID;
    notification_title TEXT;
    notification_message TEXT;
BEGIN
    -- Get alert details
    SELECT * INTO alert_record FROM public.fraud_alerts WHERE id = alert_id;
    
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    
    -- Only create notifications for high risk alerts
    IF alert_record.severity NOT IN ('HIGH', 'CRITICAL') THEN
        RETURN NULL;
    END IF;
    
    -- Build notification content
    notification_title := format('🚨 %s Risk: %s Detected', alert_record.severity, alert_record.alert_type);
    notification_message := format('Anti-cheat system detected suspicious activity with %s%% risk score. Review required.', 
        alert_record.risk_score);
    
    -- Create notification for admins
    INSERT INTO public.notifications (user_id, type, title, message)
    SELECT u.id, 'warning', notification_title, notification_message
    FROM public.users u
    WHERE u.role IN ('admin', 'manager') AND u.is_active = TRUE
    RETURNING id INTO notification_id;
    
    RETURN notification_id;
END;
$$;


ALTER FUNCTION "public"."create_fraud_alert_notification"("alert_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_fraud_alert_notification"("alert_id" "uuid") IS 'Creates notifications for high-risk fraud alerts';



CREATE OR REPLACE FUNCTION "public"."create_notification"("target_user_id" "uuid", "notification_type" "text", "notification_title" "text", "notification_message" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    notification_id UUID;
BEGIN
    INSERT INTO notifications (user_id, type, title, message)
    VALUES (target_user_id, notification_type, notification_title, notification_message)
    RETURNING id INTO notification_id;
    
    RETURN notification_id;
END;
$$;


ALTER FUNCTION "public"."create_notification"("target_user_id" "uuid", "notification_type" "text", "notification_title" "text", "notification_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_sample_analysis"("p_user_id" "uuid", "p_analysis_date" "date" DEFAULT CURRENT_DATE) RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    analysis_id TEXT;
    sample_data JSONB;
BEGIN
    analysis_id := p_user_id::TEXT || '-' || p_analysis_date::TEXT;
    
    sample_data := '{
        "executive_summary": "Sample comprehensive analysis for testing purposes",
        "productivity_insights": {
            "overall_productivity_score": 75,
            "peak_performance_hours": ["09:00-11:00", "14:00-16:00"],
            "improvement_suggestions": ["Focus on reducing interruptions", "Use time-blocking techniques"]
        },
        "behavioral_patterns": {
            "work_style_description": "Methodical and detail-oriented worker",
            "positive_behaviors": ["Consistent work schedule", "Good documentation habits"],
            "areas_for_improvement": ["Reduce multitasking", "Take more regular breaks"]
        },
        "security_analysis": {
            "risk_level": "low",
            "suspicious_activities": [],
            "security_recommendations": ["Continue following security best practices"]
        },
        "confidence_score": 85
    }';
    
    INSERT INTO public.employee_comprehensive_analysis (
        id, user_id, analysis_date, analysis_data, confidence_score, productivity_score, security_risk_level
    ) VALUES (
        analysis_id, p_user_id, p_analysis_date, sample_data, 85, 75, 'low'
    ) ON CONFLICT (user_id, analysis_date) DO UPDATE SET
        analysis_data = EXCLUDED.analysis_data,
        confidence_score = EXCLUDED.confidence_score,
        productivity_score = EXCLUDED.productivity_score,
        updated_at = NOW();
    
    RETURN p_user_id;
END;
$$;


ALTER FUNCTION "public"."create_sample_analysis"("p_user_id" "uuid", "p_analysis_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cron_run_ai_analysis"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    PERFORM * FROM public.run_ai_employee_analysis();
END;
$$;


ALTER FUNCTION "public"."cron_run_ai_analysis"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dismiss_warning"("warning_id" "uuid", "target_user_id" "uuid", "response" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.warning_logs 
  SET 
    dismissed_at = NOW(),
    action_taken = 'dismissed',
    user_response = COALESCE(response, user_response)
  WHERE warning_message_id = warning_id 
    AND user_id = target_user_id
    AND dismissed_at IS NULL
    AND shown_at >= CURRENT_DATE; -- Only dismiss today's warnings
  
  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."dismiss_warning"("warning_id" "uuid", "target_user_id" "uuid", "response" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."dismiss_warning"("warning_id" "uuid", "target_user_id" "uuid", "response" "text") IS 'Marks a warning as dismissed by the user';



CREATE OR REPLACE FUNCTION "public"."find_duplicate_screenshots"("input_user_id" "uuid", "input_duplicate_hash" "text", "hours_back" integer DEFAULT 24) RETURNS TABLE("screenshot_id" "uuid", "captured_at" timestamp with time zone, "similarity_score" integer)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id as screenshot_id,
    s.captured_at,
    90 as similarity_score -- Base similarity for same hash
  FROM public.screenshots s
  WHERE s.user_id = input_user_id
    AND s.ai_metadata->>'duplicate_hash' = input_duplicate_hash
    AND s.captured_at >= NOW() - (hours_back || ' hours')::interval
  ORDER BY s.captured_at DESC;
END;
$$;


ALTER FUNCTION "public"."find_duplicate_screenshots"("input_user_id" "uuid", "input_duplicate_hash" "text", "hours_back" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_similar_screenshots"("input_user_id" "uuid", "input_hash" "text", "hours_back" integer DEFAULT 1, "max_results" integer DEFAULT 10) RETURNS TABLE("screenshot_id" "uuid", "captured_at" timestamp with time zone, "perceptual_hash" "text", "activity_percent" integer, "app_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Return screenshots with same perceptual hash (exact visual match)
  -- Note: Hamming distance comparison would require pgvector or application logic
  RETURN QUERY
  SELECT 
    s.id as screenshot_id,
    s.captured_at,
    s.perceptual_hash,
    s.activity_percent,
    s.app_name
  FROM public.screenshots s
  WHERE s.user_id = input_user_id
    AND s.perceptual_hash = input_hash
    AND s.captured_at >= NOW() - (hours_back || ' hours')::interval
  ORDER BY s.captured_at DESC
  LIMIT max_results;
END;
$$;


ALTER FUNCTION "public"."find_similar_screenshots"("input_user_id" "uuid", "input_hash" "text", "hours_back" integer, "max_results" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_email_content_for_config"("config_record" "record", "report_data" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    html_content TEXT;
    employees JSONB;
    total_hours NUMERIC;
    active_employees INTEGER;
BEGIN
    employees := report_data->'employees';
    total_hours := COALESCE((report_data->>'totalHours')::numeric, 0);
    active_employees := COALESCE((report_data->>'activeEmployees')::integer, 0);

    html_content := '
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>' || config_record.name || '</title>
    <style>
        body { font-family: ''Segoe UI'', Arial, sans-serif; margin: 0; padding: 20px; background: #f5f7fa; }
        .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; font-weight: 300; }
        .content { padding: 30px; }
        .summary { background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 30px; display: flex; gap: 20px; flex-wrap: wrap; }
        .stat { flex: 1; min-width: 150px; text-align: center; }
        .stat-value { font-size: 24px; font-weight: bold; color: #667eea; }
        .stat-label { color: #64748b; font-size: 14px; margin-top: 5px; }
        .section { margin-bottom: 30px; }
        .section h2 { color: #1e293b; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0; }
        table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        th { background: #f1f5f9; padding: 12px; text-align: left; font-weight: 600; color: #334155; border-bottom: 2px solid #e2e8f0; }
        td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
        .footer { text-align: center; padding: 20px; background: #f8fafc; color: #64748b; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📅 ' || config_record.name || '</h1>
            <p>' || (report_data->>'date') || '</p>
        </div>
        
        <div class="content">';

    -- Add summary section if enabled
    IF config_record.include_summary THEN
        html_content := html_content || '
            <div class="summary">
                <div class="stat">
                    <div class="stat-value">' || active_employees || '</div>
                    <div class="stat-label">Employees Active</div>
                </div>
                <div class="stat">
                    <div class="stat-value">' || total_hours::numeric(5,1) || 'h</div>
                    <div class="stat-label">Total Hours</div>
                </div>
                <div class="stat">
                    <div class="stat-value">' || COALESCE(employees->0->>'sessionCount', '0') || '</div>
                    <div class="stat-label">Total Sessions</div>
                </div>
            </div>';
    END IF;

    -- Add employee details if enabled
    IF config_record.include_employee_details AND jsonb_array_length(employees) > 0 THEN
        html_content := html_content || '
            <div class="section">
                <h2>✅ Employee Performance</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Employee</th>
                            <th>Hours</th>
                            <th>Sessions</th>
                            <th>Schedule</th>
                        </tr>
                    </thead>
                    <tbody>';

        -- Add each employee row
        FOR i IN 0..(jsonb_array_length(employees) - 1) LOOP
            html_content := html_content || '
                        <tr>
                            <td><strong>' || (employees->i->>'name') || '</strong></td>
                            <td>' || COALESCE((employees->i->>'totalHours')::numeric(5,1), '0.0') || ' hrs</td>
                            <td>' || COALESCE(employees->i->>'sessionCount', '0') || '</td>
                            <td>' || COALESCE(employees->i->>'firstStart', 'N/A') || ' - ' || COALESCE(employees->i->>'lastStop', 'N/A') || '</td>
                        </tr>';
        END LOOP;

        html_content := html_content || '
                    </tbody>
                </table>
            </div>';
    END IF;

    html_content := html_content || '
        </div>
        
        <div class="footer">
            Generated by Ebdaa work time Admin System • ' || NOW() || '
        </div>
    </div>
</body>
</html>';

    RETURN html_content;
END;
$$;


ALTER FUNCTION "public"."generate_email_content_for_config"("config_record" "record", "report_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_employee_insights"("p_period_type" "text" DEFAULT 'day'::"text", "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("users_processed" integer, "insights_created" integer, "insights_updated" integer, "elapsed_ms" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."generate_employee_insights"("p_period_type" "text", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."generate_employee_insights"("p_period_type" "text", "p_user_id" "uuid") IS 'Generates employee productivity insights by aggregating analyzed screenshots. Called by pg_cron hourly.';



CREATE OR REPLACE FUNCTION "public"."generate_report_data_for_config"("config_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    config_record RECORD;
    report_data JSONB;
    today DATE := CURRENT_DATE;
    start_of_day TIMESTAMP;
    end_of_day TIMESTAMP;
BEGIN
    -- Get configuration details
    SELECT 
        rc.*,
        rt.template_type
    INTO config_record
    FROM report_configurations rc
    JOIN report_types rt ON rc.report_type_id = rt.id
    WHERE rc.id = config_id;

    IF config_record.template_type = 'daily' THEN
        start_of_day := today::timestamp;
        end_of_day := (today + INTERVAL '1 day')::timestamp - INTERVAL '1 second';
        
        -- Get daily employee data
        WITH employee_stats AS (
            SELECT 
                u.id,
                u.full_name,
                u.email,
                COUNT(tl.id) as session_count,
                COALESCE(SUM(EXTRACT(EPOCH FROM (tl.end_time - tl.start_time))/3600), 0) as total_hours,
                MIN(tl.start_time) as first_start,
                MAX(tl.end_time) as last_stop
            FROM users u
            LEFT JOIN time_logs tl ON u.id = tl.user_id 
                AND tl.start_time >= start_of_day 
                AND tl.start_time <= end_of_day
            WHERE u.role != 'admin'
            GROUP BY u.id, u.full_name, u.email
        )
        SELECT jsonb_build_object(
            'type', 'daily',
            'date', to_char(today, 'Day, Month DD, YYYY'),
            'employees', COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', es.id,
                    'name', es.full_name,
                    'email', es.email,
                    'totalHours', es.total_hours,
                    'sessionCount', es.session_count,
                    'firstStart', es.first_start,
                    'lastStop', es.last_stop
                )
            ) FILTER (WHERE es.id IS NOT NULL), '[]'::jsonb),
            'totalHours', COALESCE(SUM(es.total_hours), 0),
            'activeEmployees', COUNT(es.id)
        ) INTO report_data
        FROM employee_stats es;
        
    ELSIF config_record.template_type = 'weekly' THEN
        start_of_day := (today - INTERVAL '7 days')::timestamp;
        end_of_day := today::timestamp;
        
        -- Get weekly employee data
        WITH employee_stats AS (
            SELECT 
                u.id,
                u.full_name,
                u.email,
                COUNT(tl.id) as session_count,
                COALESCE(SUM(EXTRACT(EPOCH FROM (tl.end_time - tl.start_time))/3600), 0) as total_hours,
                MIN(tl.start_time) as first_start,
                MAX(tl.end_time) as last_stop
            FROM users u
            LEFT JOIN time_logs tl ON u.id = tl.user_id 
                AND tl.start_time >= start_of_day 
                AND tl.start_time <= end_of_day
            WHERE u.role != 'admin'
            GROUP BY u.id, u.full_name, u.email
        )
        SELECT jsonb_build_object(
            'type', 'weekly',
            'startDate', to_char(start_of_day, 'Mon DD'),
            'endDate', to_char(end_of_day, 'Mon DD, YYYY'),
            'employees', COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', es.id,
                    'name', es.full_name,
                    'email', es.email,
                    'totalHours', es.total_hours,
                    'sessionCount', es.session_count,
                    'firstStart', es.first_start,
                    'lastStop', es.last_stop
                )
            ) FILTER (WHERE es.id IS NOT NULL), '[]'::jsonb),
            'totalHours', COALESCE(SUM(es.total_hours), 0),
            'activeEmployees', COUNT(es.id)
        ) INTO report_data
        FROM employee_stats es;
    ELSE
        report_data := jsonb_build_object(
            'type', config_record.template_type,
            'date', today::text,
            'message', 'Report type not fully implemented yet'
        );
    END IF;

    RETURN report_data;
END;
$$;


ALTER FUNCTION "public"."generate_report_data_for_config"("config_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_active_warnings_for_user"("target_user_id" "uuid") RETURNS TABLE("warning_id" "uuid", "title" "text", "message" "text", "severity" "text", "display_frequency" "text", "last_shown" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    wm.id as warning_id,
    wm.title,
    wm.message,
    wm.severity,
    wm.display_frequency,
    wl.shown_at as last_shown
  FROM public.warning_messages wm
  LEFT JOIN LATERAL (
    SELECT shown_at 
    FROM public.warning_logs 
    WHERE warning_message_id = wm.id 
    AND user_id = target_user_id 
    ORDER BY shown_at DESC 
    LIMIT 1
  ) wl ON TRUE
  WHERE wm.is_active = TRUE
    AND (wm.valid_from IS NULL OR wm.valid_from <= NOW())
    AND (wm.valid_until IS NULL OR wm.valid_until >= NOW())
    AND (
      wm.target_audience = 'all' 
      OR (wm.target_audience = 'employee' AND EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = target_user_id 
        AND role = 'employee'
      ))
      OR (wm.target_audience = 'specific' AND target_user_id = ANY(wm.target_user_ids))
    )
    AND (
      wm.display_frequency = 'always' 
      OR (wm.display_frequency = 'once' AND wl.shown_at IS NULL)
      OR (wm.display_frequency = 'daily' AND (wl.shown_at IS NULL OR wl.shown_at < CURRENT_DATE))
      OR (wm.display_frequency = 'weekly' AND (wl.shown_at IS NULL OR wl.shown_at < CURRENT_DATE - INTERVAL '7 days'))
    )
  ORDER BY wm.severity DESC, wm.created_at ASC;
END;
$$;


ALTER FUNCTION "public"."get_active_warnings_for_user"("target_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_active_warnings_for_user"("target_user_id" "uuid") IS 'Returns active warnings for a specific user based on frequency and target criteria';



CREATE OR REPLACE FUNCTION "public"."get_app_settings"() RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Return default settings - in production, this would come from a settings table
    RETURN json_build_object(
        'screenshot_interval', 300,
        'idle_threshold', 300,
        'blur_screenshots', false,
        'track_urls', true,
        'track_applications', true,
        'auto_start_tracking', false,
        'max_idle_time', 2400,
        'screenshot_quality', 80,
        'notification_frequency', 120
    );
END;
$$;


ALTER FUNCTION "public"."get_app_settings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_cron_job_status"("p_jobname" "text") RETURNS TABLE("jobname" "text", "status" "text", "return_message" "text", "start_time" timestamp with time zone, "end_time" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."get_cron_job_status"("p_jobname" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_user_context"() RETURNS TABLE("user_id" "uuid", "organization_id" "uuid", "role" "text", "is_org_admin" boolean, "is_super_admin" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM set_config('row_security', 'off', true);

  RETURN QUERY
  SELECT
    u.id,
    u.organization_id,
    u.role,
    COALESCE(u.is_org_admin, false),
    COALESCE(u.is_super_admin, false)
  FROM public.users u
  WHERE u.id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."get_current_user_context"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_due_reports"("check_time" timestamp with time zone DEFAULT "now"()) RETURNS TABLE("config_id" "uuid", "config_name" "text", "template_type" "text", "subject_template" "text", "recipients" json)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rc.id as config_id,
        rc.name as config_name,
        rt.template_type,
        rc.subject_template,
        json_agg(
            json_build_object(
                'email', rr.email,
                'user_id', rr.user_id
            )
        ) as recipients
    FROM public.report_configurations rc
    JOIN public.report_types rt ON rt.id = rc.report_type_id
    JOIN public.report_recipients rr ON rr.report_config_id = rc.id
    WHERE rc.is_active = true
    AND rt.is_active = true
    AND rr.is_active = true
    AND rc.schedule_cron IS NOT NULL
    GROUP BY rc.id, rc.name, rt.template_type, rc.subject_template;
END;
$$;


ALTER FUNCTION "public"."get_due_reports"("check_time" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_due_reports"("check_time" timestamp with time zone) IS 'Gets report configurations that are due to be sent';



CREATE OR REPLACE FUNCTION "public"."get_employee_finance_summary"("target_month" "date" DEFAULT CURRENT_DATE) RETURNS TABLE("user_id" "uuid", "email" "text", "full_name" "text", "employment_type" "text", "required_hours" numeric, "required_days" integer, "actual_hours" numeric, "actual_days" integer, "gap_percentage" numeric, "compliance_status" "text", "warning_level" "text", "total_deductions" numeric, "warning_count" integer, "unreviewed_warnings" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id as user_id,
        u.email,
        u.full_name,
        COALESCE(ews.employment_type, 'hourly') as employment_type,
        COALESCE(ews.required_hours_monthly, 160) as required_hours,
        COALESCE(ews.required_days_monthly, 22) as required_days,
        COALESCE(work_data.total_hours, 0) as actual_hours,
        COALESCE(work_data.total_days, 0) as actual_days,
        CASE 
            WHEN COALESCE(ews.employment_type, 'hourly') = 'hourly' AND COALESCE(ews.required_hours_monthly, 160) > 0 THEN
                ROUND(((COALESCE(ews.required_hours_monthly, 160) - COALESCE(work_data.total_hours, 0)) / COALESCE(ews.required_hours_monthly, 160) * 100), 2)
            WHEN COALESCE(ews.employment_type, 'hourly') = 'monthly' AND COALESCE(ews.required_days_monthly, 22) > 0 THEN
                ROUND(((COALESCE(ews.required_days_monthly, 22) - COALESCE(work_data.total_days, 0)) / COALESCE(ews.required_days_monthly, 22)::DECIMAL * 100), 2)
            ELSE 0
        END as gap_percentage,
        CASE 
            WHEN COALESCE(work_data.total_hours, 0) >= COALESCE(ews.required_hours_monthly, 160) OR 
                 COALESCE(work_data.total_days, 0) >= COALESCE(ews.required_days_monthly, 22) THEN 'compliant'
            WHEN COALESCE(work_data.total_hours, 0) >= (COALESCE(ews.required_hours_monthly, 160) * COALESCE(ews.warning_threshold_percentage, 90) / 100) OR
                 COALESCE(work_data.total_days, 0) >= (COALESCE(ews.required_days_monthly, 22) * COALESCE(ews.warning_threshold_percentage, 90) / 100) THEN 'warning'
            ELSE 'critical'
        END as compliance_status,
        CASE 
            WHEN COALESCE(work_data.total_hours, 0) >= COALESCE(ews.required_hours_monthly, 160) OR 
                 COALESCE(work_data.total_days, 0) >= COALESCE(ews.required_days_monthly, 22) THEN 'none'
            WHEN COALESCE(work_data.total_hours, 0) >= (COALESCE(ews.required_hours_monthly, 160) * 0.8) OR
                 COALESCE(work_data.total_days, 0) >= (COALESCE(ews.required_days_monthly, 22) * 0.8) THEN 'low'
            WHEN COALESCE(work_data.total_hours, 0) >= (COALESCE(ews.required_hours_monthly, 160) * 0.6) OR
                 COALESCE(work_data.total_days, 0) >= (COALESCE(ews.required_days_monthly, 22) * 0.6) THEN 'medium'
            ELSE 'high'
        END as warning_level,
        COALESCE(deduction_data.total_deductions, 0) as total_deductions,
        COALESCE(warning_data.warning_count, 0) as warning_count,
        COALESCE(warning_data.unreviewed_warnings, 0) as unreviewed_warnings
    FROM public.users u
    LEFT JOIN public.employee_working_standards ews ON ews.user_id = u.id AND ews.is_active = TRUE
    LEFT JOIN (
        SELECT 
            tl.user_id,
            SUM(EXTRACT(EPOCH FROM (COALESCE(tl.end_time, NOW()) - tl.start_time)) / 3600) as total_hours,
            COUNT(DISTINCT DATE(tl.start_time)) as total_days
        FROM public.time_logs tl
        WHERE DATE_TRUNC('month', tl.start_time) = DATE_TRUNC('month', target_month)
        AND tl.end_time IS NOT NULL
        GROUP BY tl.user_id
    ) work_data ON work_data.user_id = u.id
    LEFT JOIN (
        SELECT 
            ed.user_id,
            SUM(ed.amount) as total_deductions
        FROM public.employee_deductions ed
        WHERE DATE_TRUNC('month', ed.month_year) = DATE_TRUNC('month', target_month)
        AND ed.is_active = TRUE
        GROUP BY ed.user_id
    ) deduction_data ON deduction_data.user_id = u.id
    LEFT JOIN (
        SELECT 
            ew.user_id,
            COUNT(*) as warning_count,
            COUNT(CASE WHEN NOT ew.is_reviewed THEN 1 END) as unreviewed_warnings
        FROM public.employee_warnings ew
        WHERE DATE_TRUNC('month', ew.month_year) = DATE_TRUNC('month', target_month)
        GROUP BY ew.user_id
    ) warning_data ON warning_data.user_id = u.id
    WHERE u.role = 'employee' AND u.is_active = TRUE
    ORDER BY u.full_name;
END;
$$;


ALTER FUNCTION "public"."get_employee_finance_summary"("target_month" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_employee_finance_summary"("target_month" "date") IS 'Gets comprehensive finance summary for all employees';



CREATE OR REPLACE FUNCTION "public"."get_fraud_alerts_summary"("days_back" integer DEFAULT 7, "target_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("user_id" "uuid", "user_name" "text", "total_alerts" integer, "high_risk_alerts" integer, "critical_alerts" integer, "unreviewed_alerts" integer, "avg_risk_score" numeric, "latest_alert_at" timestamp with time zone, "most_common_type" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        fa.user_id,
        u.full_name as user_name,
        COUNT(fa.id)::INTEGER as total_alerts,
        COUNT(CASE WHEN fa.severity = 'HIGH' THEN 1 END)::INTEGER as high_risk_alerts,
        COUNT(CASE WHEN fa.severity = 'CRITICAL' THEN 1 END)::INTEGER as critical_alerts,
        COUNT(CASE WHEN NOT fa.is_reviewed THEN 1 END)::INTEGER as unreviewed_alerts,
        ROUND(AVG(fa.risk_score), 2) as avg_risk_score,
        MAX(fa.detected_at) as latest_alert_at,
        MODE() WITHIN GROUP (ORDER BY fa.alert_type) as most_common_type
    FROM public.fraud_alerts fa
    JOIN public.users u ON u.id = fa.user_id
    WHERE fa.detected_at >= NOW() - (days_back || ' days')::interval
    AND (target_user_id IS NULL OR fa.user_id = target_user_id)
    AND NOT fa.is_false_positive
    GROUP BY fa.user_id, u.full_name
    ORDER BY total_alerts DESC, avg_risk_score DESC;
END;
$$;


ALTER FUNCTION "public"."get_fraud_alerts_summary"("days_back" integer, "target_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_fraud_alerts_summary"("days_back" integer, "target_user_id" "uuid") IS 'Gets summary of fraud alerts for monitoring dashboard';



CREATE OR REPLACE FUNCTION "public"."get_organization_by_slug"("org_slug" "text") RETURNS TABLE("id" "uuid", "name" "text", "slug" "text", "logo_url" "text", "is_active" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT o.id, o.name, o.slug, o.logo_url, o.is_active
    FROM public.organizations o
    WHERE o.slug = org_slug;
END;
$$;


ALTER FUNCTION "public"."get_organization_by_slug"("org_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_organization_cost_insights"("p_organization_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
WITH caller AS (
  SELECT
    u.role::text AS role,
    u.organization_id AS org_id,
    COALESCE(u.is_org_admin, false) AS is_org_admin,
    COALESCE(u.is_super_admin, false) AS is_super_admin
  FROM public.users u
  WHERE u.id = auth.uid()
),
allowed AS (
  SELECT EXISTS (
    SELECT 1
    FROM caller c
    WHERE c.is_super_admin
       OR (
            (c.role = 'admin' OR c.is_org_admin)
            AND c.org_id IS NOT NULL
            AND c.org_id = p_organization_id
          )
  ) AS ok
),
scoped AS (
  SELECT
    s.user_id,
    s.file_size,
    s.ai_metadata,
    s.ai_model_used,
    s.ai_analysis_status,
    u.full_name AS user_full_name,
    u.email AS user_email
  FROM public.screenshots s
  LEFT JOIN public.users u ON u.id = s.user_id
  CROSS JOIN allowed a
  WHERE a.ok
    AND COALESCE(s.organization_id, u.organization_id) = p_organization_id
)
SELECT CASE
  WHEN auth.uid() IS NULL THEN jsonb_build_object('error', 'not_authenticated')
  WHEN NOT (SELECT ok FROM allowed) THEN jsonb_build_object('error', 'forbidden')
  ELSE jsonb_build_object(
    'organization_id', p_organization_id::text,
    'storage_totals', (
      SELECT jsonb_build_object(
        'bytes', COALESCE(SUM(COALESCE(file_size, 0)), 0)::bigint,
        'screenshot_count', COUNT(*)::bigint
      )
      FROM scoped
    ),
    'storage_by_user', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'user_id', t.user_id::text,
            'full_name', t.user_full_name,
            'email', t.user_email,
            'bytes', t.bytes,
            'screenshot_count', t.cnt,
            'avg_bytes_per_shot',
              CASE WHEN t.cnt > 0 THEN ROUND(t.bytes::numeric / t.cnt::numeric)::bigint ELSE 0::bigint END
          )
          ORDER BY t.bytes DESC
        )
        FROM (
          SELECT
            user_id,
            MAX(user_full_name) AS user_full_name,
            MAX(user_email) AS user_email,
            SUM(COALESCE(file_size, 0))::bigint AS bytes,
            COUNT(*)::bigint AS cnt
          FROM scoped
          GROUP BY user_id
        ) t
      ),
      '[]'::jsonb
    ),
    'llm_totals', (
      SELECT jsonb_build_object(
        'completed_analyses', COUNT(*) FILTER (WHERE ai_analysis_status = 'completed')::bigint,
        'non_pattern_model_rows', COUNT(*) FILTER (
          WHERE ai_model_used IS NOT NULL AND ai_model_used <> 'pattern-based'
        )::bigint,
        'rows_with_token_usage', COUNT(*) FILTER (
          WHERE ai_metadata ? 'deepseek_usage'
            AND NULLIF(btrim(ai_metadata->'deepseek_usage'->>'total_tokens'), '') IS NOT NULL
        )::bigint,
        'total_deepseek_tokens', COALESCE(
          SUM(
            CASE
              WHEN ai_metadata ? 'deepseek_usage'
                AND NULLIF(btrim(ai_metadata->'deepseek_usage'->>'total_tokens'), '') IS NOT NULL
              THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->>'total_tokens'), ''))::bigint
              ELSE 0::bigint
            END
          ),
          0::bigint
        ),
        'total_prompt_tokens', COALESCE(
          SUM(
            COALESCE(
              CASE
                WHEN ai_metadata ? 'deepseek_usage'
                  AND (ai_metadata->'deepseek_usage') ? 'text'
                  AND NULLIF(btrim(ai_metadata->'deepseek_usage'->'text'->>'prompt_tokens'), '') IS NOT NULL
                THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->'text'->>'prompt_tokens'), ''))::bigint
                ELSE 0::bigint
              END,
              0::bigint
            )
            +
            COALESCE(
              CASE
                WHEN ai_metadata ? 'deepseek_usage'
                  AND (ai_metadata->'deepseek_usage') ? 'vision'
                  AND NULLIF(btrim(ai_metadata->'deepseek_usage'->'vision'->>'prompt_tokens'), '') IS NOT NULL
                THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->'vision'->>'prompt_tokens'), ''))::bigint
                ELSE 0::bigint
              END,
              0::bigint
            )
          ),
          0::bigint
        ),
        'total_completion_tokens', COALESCE(
          SUM(
            COALESCE(
              CASE
                WHEN ai_metadata ? 'deepseek_usage'
                  AND (ai_metadata->'deepseek_usage') ? 'text'
                  AND NULLIF(btrim(ai_metadata->'deepseek_usage'->'text'->>'completion_tokens'), '') IS NOT NULL
                THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->'text'->>'completion_tokens'), ''))::bigint
                ELSE 0::bigint
              END,
              0::bigint
            )
            +
            COALESCE(
              CASE
                WHEN ai_metadata ? 'deepseek_usage'
                  AND (ai_metadata->'deepseek_usage') ? 'vision'
                  AND NULLIF(btrim(ai_metadata->'deepseek_usage'->'vision'->>'completion_tokens'), '') IS NOT NULL
                THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->'vision'->>'completion_tokens'), ''))::bigint
                ELSE 0::bigint
              END,
              0::bigint
            )
          ),
          0::bigint
        ),
        'text_prompt_tokens', COALESCE(
          SUM(
            CASE
              WHEN ai_metadata ? 'deepseek_usage'
                AND (ai_metadata->'deepseek_usage') ? 'text'
                AND NULLIF(btrim(ai_metadata->'deepseek_usage'->'text'->>'prompt_tokens'), '') IS NOT NULL
              THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->'text'->>'prompt_tokens'), ''))::bigint
              ELSE 0::bigint
            END
          ),
          0::bigint
        ),
        'text_completion_tokens', COALESCE(
          SUM(
            CASE
              WHEN ai_metadata ? 'deepseek_usage'
                AND (ai_metadata->'deepseek_usage') ? 'text'
                AND NULLIF(btrim(ai_metadata->'deepseek_usage'->'text'->>'completion_tokens'), '') IS NOT NULL
              THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->'text'->>'completion_tokens'), ''))::bigint
              ELSE 0::bigint
            END
          ),
          0::bigint
        ),
        'text_total_tokens', COALESCE(
          SUM(
            CASE
              WHEN ai_metadata ? 'deepseek_usage'
                AND (ai_metadata->'deepseek_usage') ? 'text'
                AND NULLIF(btrim(ai_metadata->'deepseek_usage'->'text'->>'total_tokens'), '') IS NOT NULL
              THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->'text'->>'total_tokens'), ''))::bigint
              ELSE 0::bigint
            END
          ),
          0::bigint
        ),
        'vision_prompt_tokens', COALESCE(
          SUM(
            CASE
              WHEN ai_metadata ? 'deepseek_usage'
                AND (ai_metadata->'deepseek_usage') ? 'vision'
                AND NULLIF(btrim(ai_metadata->'deepseek_usage'->'vision'->>'prompt_tokens'), '') IS NOT NULL
              THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->'vision'->>'prompt_tokens'), ''))::bigint
              ELSE 0::bigint
            END
          ),
          0::bigint
        ),
        'vision_completion_tokens', COALESCE(
          SUM(
            CASE
              WHEN ai_metadata ? 'deepseek_usage'
                AND (ai_metadata->'deepseek_usage') ? 'vision'
                AND NULLIF(btrim(ai_metadata->'deepseek_usage'->'vision'->>'completion_tokens'), '') IS NOT NULL
              THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->'vision'->>'completion_tokens'), ''))::bigint
              ELSE 0::bigint
            END
          ),
          0::bigint
        ),
        'vision_total_tokens', COALESCE(
          SUM(
            CASE
              WHEN ai_metadata ? 'deepseek_usage'
                AND (ai_metadata->'deepseek_usage') ? 'vision'
                AND NULLIF(btrim(ai_metadata->'deepseek_usage'->'vision'->>'total_tokens'), '') IS NOT NULL
              THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->'vision'->>'total_tokens'), ''))::bigint
              ELSE 0::bigint
            END
          ),
          0::bigint
        ),
        'avg_total_tokens_per_logged_row', (
          SELECT CASE
            WHEN cnt = 0 THEN 0::bigint
            ELSE ROUND(tsum::numeric / cnt::numeric)::bigint
          END
          FROM (
            SELECT
              COUNT(*) FILTER (
                WHERE ai_metadata ? 'deepseek_usage'
                  AND NULLIF(btrim(ai_metadata->'deepseek_usage'->>'total_tokens'), '') IS NOT NULL
              )::bigint AS cnt,
              COALESCE(
                SUM(
                  CASE
                    WHEN ai_metadata ? 'deepseek_usage'
                      AND NULLIF(btrim(ai_metadata->'deepseek_usage'->>'total_tokens'), '') IS NOT NULL
                    THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->>'total_tokens'), ''))::bigint
                    ELSE 0::bigint
                  END
                ),
                0::bigint
              ) AS tsum
            FROM scoped
          ) z
        )
      )
      FROM scoped
    ),
    'llm_by_model', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'ai_model_used', m.ai_model_used,
            'count', m.cnt
          )
          ORDER BY m.cnt DESC
        )
        FROM (
          SELECT ai_model_used, COUNT(*)::bigint AS cnt
          FROM scoped
          WHERE ai_model_used IS NOT NULL
            AND ai_model_used <> 'pattern-based'
          GROUP BY ai_model_used
        ) m
      ),
      '[]'::jsonb
    ),
    'llm_tokens_by_model', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'model', t.ai_model_used,
            'analysis_rows', t.analysis_rows,
            'rows_with_token_log', t.rows_with_token_log,
            'total_tokens', t.total_tokens,
            'prompt_tokens', t.prompt_tokens,
            'completion_tokens', t.completion_tokens
          )
          ORDER BY t.total_tokens DESC
        )
        FROM (
          SELECT
            ai_model_used,
            COUNT(*)::bigint AS analysis_rows,
            COUNT(*) FILTER (
              WHERE ai_metadata ? 'deepseek_usage'
                AND NULLIF(btrim(ai_metadata->'deepseek_usage'->>'total_tokens'), '') IS NOT NULL
            )::bigint AS rows_with_token_log,
            COALESCE(
              SUM(
                CASE
                  WHEN ai_metadata ? 'deepseek_usage'
                    AND NULLIF(btrim(ai_metadata->'deepseek_usage'->>'total_tokens'), '') IS NOT NULL
                  THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->>'total_tokens'), ''))::bigint
                  ELSE 0::bigint
                END
              ),
              0::bigint
            ) AS total_tokens,
            COALESCE(
              SUM(
                COALESCE(
                  CASE
                    WHEN ai_metadata ? 'deepseek_usage'
                      AND (ai_metadata->'deepseek_usage') ? 'text'
                      AND NULLIF(btrim(ai_metadata->'deepseek_usage'->'text'->>'prompt_tokens'), '') IS NOT NULL
                    THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->'text'->>'prompt_tokens'), ''))::bigint
                    ELSE 0::bigint
                  END,
                  0::bigint
                )
                +
                COALESCE(
                  CASE
                    WHEN ai_metadata ? 'deepseek_usage'
                      AND (ai_metadata->'deepseek_usage') ? 'vision'
                      AND NULLIF(btrim(ai_metadata->'deepseek_usage'->'vision'->>'prompt_tokens'), '') IS NOT NULL
                    THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->'vision'->>'prompt_tokens'), ''))::bigint
                    ELSE 0::bigint
                  END,
                  0::bigint
                )
              ),
              0::bigint
            ) AS prompt_tokens,
            COALESCE(
              SUM(
                COALESCE(
                  CASE
                    WHEN ai_metadata ? 'deepseek_usage'
                      AND (ai_metadata->'deepseek_usage') ? 'text'
                      AND NULLIF(btrim(ai_metadata->'deepseek_usage'->'text'->>'completion_tokens'), '') IS NOT NULL
                    THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->'text'->>'completion_tokens'), ''))::bigint
                    ELSE 0::bigint
                  END,
                  0::bigint
                )
                +
                COALESCE(
                  CASE
                    WHEN ai_metadata ? 'deepseek_usage'
                      AND (ai_metadata->'deepseek_usage') ? 'vision'
                      AND NULLIF(btrim(ai_metadata->'deepseek_usage'->'vision'->>'completion_tokens'), '') IS NOT NULL
                    THEN (NULLIF(btrim(ai_metadata->'deepseek_usage'->'vision'->>'completion_tokens'), ''))::bigint
                    ELSE 0::bigint
                  END,
                  0::bigint
                )
              ),
              0::bigint
            ) AS completion_tokens
          FROM scoped
          WHERE ai_model_used IS NOT NULL
            AND ai_model_used <> 'pattern-based'
          GROUP BY ai_model_used
        ) t
      ),
      '[]'::jsonb
    )
  )
END;
$$;


ALTER FUNCTION "public"."get_organization_cost_insights"("p_organization_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_organization_cost_insights"("p_organization_id" "uuid") IS 'Org-scoped screenshot bytes + DeepSeek token aggregates (scoped by screenshots.organization_id with fallback to users.organization_id).';



CREATE OR REPLACE FUNCTION "public"."get_privacy_risk_screenshots"("input_user_id" "uuid" DEFAULT NULL::"uuid", "risk_threshold" integer DEFAULT 50, "hours_back" integer DEFAULT 168) RETURNS TABLE("screenshot_id" "uuid", "user_id" "uuid", "captured_at" timestamp with time zone, "privacy_risk_score" integer, "privacy_concerns" "text"[])
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id as screenshot_id,
    s.user_id,
    s.captured_at,
    (s.ai_metadata->>'privacy_risk_score')::INTEGER as privacy_risk_score,
    ARRAY(SELECT jsonb_array_elements_text(s.ai_metadata->'privacy_concerns')) as privacy_concerns
  FROM public.screenshots s
  WHERE (input_user_id IS NULL OR s.user_id = input_user_id)
    AND (s.ai_metadata->>'privacy_risk_score')::INTEGER >= risk_threshold
    AND s.captured_at >= NOW() - (hours_back || ' hours')::interval
    AND s.ai_analysis_status = 'completed'
  ORDER BY (s.ai_metadata->>'privacy_risk_score')::INTEGER DESC, s.captured_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_privacy_risk_screenshots"("input_user_id" "uuid", "risk_threshold" integer, "hours_back" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_recent_http_stats"("p_since" timestamp with time zone) RETURNS TABLE("total_requests" bigint, "success_requests" bigint, "failed_requests" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    COUNT(*)                                          AS total_requests,
    COUNT(*) FILTER (WHERE status_code BETWEEN 200 AND 299) AS success_requests,
    COUNT(*) FILTER (WHERE status_code < 200 OR status_code >= 300 OR status_code IS NULL) AS failed_requests
  FROM net._http_response
  WHERE created > p_since;
$$;


ALTER FUNCTION "public"."get_recent_http_stats"("p_since" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_organization_id"("user_id" "uuid" ) RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT organization_id FROM public.users WHERE id = user_id;
$$;


ALTER FUNCTION "public"."get_user_organization_id"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role"("uid" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role FROM public.users WHERE id = uid;
$$;


ALTER FUNCTION "public"."get_user_role"("uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_worker_status"("worker_type_param" "text") RETURNS TABLE("is_running" boolean, "last_run" timestamp with time zone, "next_run" timestamp with time zone, "processed_today" integer, "pending_analyses" integer, "error_rate" numeric, "openai_enabled" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ws.is_running,
        ws.last_run,
        ws.last_run + INTERVAL '15 minutes' as next_run,
        COALESCE((
            SELECT SUM(successful_analyses) 
            FROM ai_analysis_metrics 
            WHERE date = CURRENT_DATE
        ), 0)::INTEGER as processed_today,
        (
            SELECT COUNT(*)::INTEGER 
            FROM ai_analysis_queue 
            WHERE status = 'pending'
        ) as pending_analyses,
        ws.error_rate,
        true as openai_enabled -- This would be set based on actual API key presence
    FROM worker_status ws
    WHERE ws.worker_type = worker_type_param;
END;
$$;


ALTER FUNCTION "public"."get_worker_status"("worker_type_param" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hamming_distance_hex64"("a_hex" "text", "b_hex" "text") RETURNS integer
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  a_bits bit(64);
  b_bits bit(64);
BEGIN
  -- Convert 16-char hex into 64-bit bit strings
  a_bits := lpad((('x' || a_hex)::bit(64))::text, 64, '0')::bit(64);
  b_bits := lpad((('x' || b_hex)::bit(64))::text, 64, '0')::bit(64);

  RETURN bit_count(a_bits # b_bits);
END;
$$;


ALTER FUNCTION "public"."hamming_distance_hex64"("a_hex" "text", "b_hex" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."hamming_distance_hex64"("a_hex" "text", "b_hex" "text") IS 'Returns Hamming distance between two 64-bit hashes represented as 16-char hex strings.';



CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  metadata jsonb;
  org_id uuid;
BEGIN
  metadata := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  
  -- Set default role if not provided
  IF NOT (metadata ? 'role') THEN
    metadata := jsonb_set(metadata, '{role}', '"employee"');
  END IF;

  -- Extract organization_id from metadata
  org_id := NULL;
  IF metadata ? 'organization_id' AND metadata->>'organization_id' IS NOT NULL AND metadata->>'organization_id' != '' THEN
    org_id := (metadata->>'organization_id')::uuid;
  END IF;

  -- update metadata on auth.users
  NEW.raw_user_meta_data := metadata;

  -- insert into public.users table with organization_id
  INSERT INTO public.users(id, email, full_name, avatar_url, role, organization_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(metadata->>'full_name', NEW.email),
    metadata->>'avatar_url',
    metadata->>'role',
    org_id
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."infer_idle_screenshots"() RETURNS TABLE("idle_marked" integer, "elapsed_ms" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    start_time TIMESTAMPTZ := clock_timestamp();
    v_idle INTEGER := 0;
BEGIN
    -- Mark screenshots as idle based on obvious idle indicators
    UPDATE public.screenshots
    SET idle_inferred = true
    WHERE (idle_inferred IS NULL OR idle_inferred = false)
      AND captured_at > NOW() - INTERVAL '7 days'
      AND (
          -- Zero activity is a strong idle indicator
          activity_percent = 0
          -- Lock screen indicators
          OR LOWER(COALESCE(window_title, '')) LIKE '%lock screen%'
          OR LOWER(COALESCE(window_title, '')) LIKE '%screensaver%'
          OR LOWER(COALESCE(window_title, '')) LIKE '%screen saver%'
          OR LOWER(COALESCE(app_name, '')) LIKE '%loginwindow%'
          OR LOWER(COALESCE(app_name, '')) LIKE '%lockapp%'
          OR LOWER(COALESCE(window_title, '')) LIKE '%windows security%'
          OR LOWER(COALESCE(window_title, '')) LIKE '%sign-in%'
      );
      
    GET DIAGNOSTICS v_idle = ROW_COUNT;
    
    idle_marked := v_idle;
    elapsed_ms := EXTRACT(MILLISECOND FROM (clock_timestamp() - start_time))::INTEGER;
    
    RETURN NEXT;
END;
$$;


ALTER FUNCTION "public"."infer_idle_screenshots"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."infer_idle_screenshots"() IS 'Infers idle state for screenshots based on activity level and window indicators.
Duplicate detection is now handled EXCLUSIVELY by the Vision Validator edge function
using perceptual hash (dHash) comparison with Hamming distance thresholds.

The old detect_duplicates_and_idle() function was causing FALSE POSITIVES by
marking screenshots as duplicates based on window_title matching, which fails
when browsing different pages of the same website.

Vision Validator thresholds:
- EXACT_DUPLICATE: Hamming distance = 0 (identical images)
- NEAR_DUPLICATE: Hamming distance <= 5 (same screen, minor cursor movement)
- SIMILAR_CONTENT: Hamming distance <= 10 (same page, slight scroll)';



CREATE OR REPLACE FUNCTION "public"."is_org_admin"("user_id" "uuid" ) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT COALESCE(is_org_admin, FALSE) FROM public.users WHERE id = user_id;
$$;


ALTER FUNCTION "public"."is_org_admin"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"("user_id" "uuid" ) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT COALESCE(is_super_admin, FALSE) FROM public.users WHERE id = user_id;
$$;


ALTER FUNCTION "public"."is_super_admin"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_report_send"("p_config_id" "uuid", "p_status" "text", "p_recipient_count" integer DEFAULT 0, "p_error_message" "text" DEFAULT NULL::"text", "p_email_service_id" "text" DEFAULT NULL::"text", "p_report_data" "jsonb" DEFAULT NULL::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    report_history_id UUID;
BEGIN
    INSERT INTO public.report_history (
        report_config_id,
        status,
        recipient_count,
        error_message,
        email_service_id,
        report_data
    ) VALUES (
        p_config_id,
        p_status,
        p_recipient_count,
        p_error_message,
        p_email_service_id,
        p_report_data
    ) RETURNING id INTO report_history_id;
    
    RETURN report_history_id;
END;
$$;


ALTER FUNCTION "public"."log_report_send"("p_config_id" "uuid", "p_status" "text", "p_recipient_count" integer, "p_error_message" "text", "p_email_service_id" "text", "p_report_data" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."log_report_send"("p_config_id" "uuid", "p_status" "text", "p_recipient_count" integer, "p_error_message" "text", "p_email_service_id" "text", "p_report_data" "jsonb") IS 'Logs report send attempts with status and details';



CREATE OR REPLACE FUNCTION "public"."log_warning_shown"("warning_id" "uuid", "target_user_id" "uuid", "action" "text" DEFAULT 'shown'::"text", "response" "text" DEFAULT NULL::"text", "warning_context" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO public.warning_logs (
    warning_message_id,
    user_id,
    action_taken,
    user_response,
    context
  ) VALUES (
    warning_id,
    target_user_id,
    action,
    response,
    warning_context
  ) RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$;


ALTER FUNCTION "public"."log_warning_shown"("warning_id" "uuid", "target_user_id" "uuid", "action" "text", "response" "text", "warning_context" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."log_warning_shown"("warning_id" "uuid", "target_user_id" "uuid", "action" "text", "response" "text", "warning_context" "jsonb") IS 'Logs when a warning is shown to a user with optional context';



CREATE OR REPLACE FUNCTION "public"."mark_screenshot_for_reanalysis"("screenshot_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE public.screenshots 
  SET ai_analysis_status = 'pending',
      ai_analyzed_at = NULL,
      ai_metadata = COALESCE(ai_metadata, '{}'::jsonb) || jsonb_build_object('reanalysis_requested_at', NOW())
  WHERE id = screenshot_id;
  
  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."mark_screenshot_for_reanalysis"("screenshot_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_employee_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  change_type TEXT;
  old_active BOOLEAN;
  new_active BOOLEAN;
  changed_by_name TEXT;
  notification_payload JSONB;
BEGIN
  -- Determine old and new status
  old_active := COALESCE(OLD.is_active, true);
  new_active := COALESCE(NEW.is_active, true);
  
  -- Skip if no status change
  IF old_active = new_active THEN
    RETURN NEW;
  END IF;
  
  -- Only process for employees
  IF NEW.role != 'employee' THEN
    RETURN NEW;
  END IF;
  
  -- Determine change type
  IF TG_OP = 'INSERT' AND new_active = true THEN
    change_type := 'joined';
  ELSIF old_active = false AND new_active = true THEN
    change_type := 'activated';
  ELSIF old_active = true AND new_active = false THEN
    change_type := 'deactivated';
  ELSE
    RETURN NEW; -- No relevant change
  END IF;
  
  -- Get the name of who made the change (from auth context or system)
  SELECT COALESCE(u.full_name, u.email, 'System')
  INTO changed_by_name
  FROM public.users u
  WHERE u.id = auth.uid()
  LIMIT 1;
  
  IF changed_by_name IS NULL THEN
    changed_by_name := 'System';
  END IF;
  
  -- Build notification payload
  notification_payload := jsonb_build_object(
    'employee_id', NEW.id,
    'employee_email', NEW.email,
    'employee_name', COALESCE(NEW.full_name, NEW.email),
    'old_status', CASE WHEN old_active THEN 'active' ELSE 'inactive' END,
    'new_status', CASE WHEN new_active THEN 'active' ELSE 'inactive' END,
    'change_type', change_type,
    'changed_by', changed_by_name,
    'reason', COALESCE(NEW.pause_reason, 'Status change'),
    'timestamp', NOW()::text,
    'endpoint', 'employee-status-change'
  );
  
  -- Queue notification instead of making HTTP call directly
  -- This avoids the session-scoped setting issue
  INSERT INTO public.notification_log (
    notification_type,
    recipient_type,
    recipient_id,
    payload,
    status,
    created_at
  ) VALUES (
    'employee_status_change',
    'hr_admin',
    NEW.id,
    notification_payload,
    'queued',  -- Changed from 'sent' to 'queued'
    NOW()
  );
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_employee_status_change"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."notify_employee_status_change"() IS 'Automatically sends email notifications when employee status changes';



CREATE OR REPLACE FUNCTION "public"."notify_new_employee_welcome"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  notification_payload JSONB;
BEGIN
  -- Only process for new employees
  IF NEW.role != 'employee' THEN
    RETURN NEW;
  END IF;
  
  -- Only send welcome for new active employees
  IF NOT COALESCE(NEW.is_active, true) THEN
    RETURN NEW;
  END IF;
  
  -- Build notification payload
  notification_payload := jsonb_build_object(
    'employee_id', NEW.id,
    'employee_email', NEW.email,
    'employee_name', COALESCE(NEW.full_name, NEW.email),
    'endpoint', 'new-employee-welcome'
  );
  
  -- Queue notification instead of making HTTP call directly
  INSERT INTO public.notification_log (
    notification_type,
    recipient_type,
    recipient_id,
    payload,
    status,
    created_at
  ) VALUES (
    'new_employee_welcome',
    'hr_admin',
    NEW.id,
    notification_payload,
    'queued',  -- Changed from 'sent' to 'queued'
    NOW()
  );
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_new_employee_welcome"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."notify_new_employee_welcome"() IS 'Sends welcome email notifications for new employees';



CREATE OR REPLACE FUNCTION "public"."pause_user"("target_user_id" "uuid", "admin_user_id" "uuid", "reason" "text" DEFAULT 'Administrative action'::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Check if the admin has permission (is admin or manager)
  IF NOT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = admin_user_id 
    AND role IN ('admin', 'manager')
    AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Insufficient permissions to pause user';
  END IF;

  -- Update the user status
  UPDATE public.users 
  SET 
    is_active = false,
    paused_at = NOW(),
    paused_by = admin_user_id,
    pause_reason = reason
  WHERE id = target_user_id;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."pause_user"("target_user_id" "uuid", "admin_user_id" "uuid", "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_notification_queue"("batch_limit" integer DEFAULT 50) RETURNS TABLE("processed_count" integer, "failed_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_processed INTEGER := 0;
    v_failed INTEGER := 0;
    v_notification RECORD;
    v_supabase_url TEXT := 'https://fkpiqcxkmrtaetvfgcli.supabase.co';
    v_service_key TEXT;
    v_endpoint TEXT;
BEGIN
    -- Get service role key from vault (if available) or use hardcoded
    -- Note: In production, store this in Supabase Vault
    v_service_key := '***KEY_REMOVED***';

    -- Process queued notifications
    FOR v_notification IN
        SELECT id, notification_type, payload
        FROM public.notification_log
        WHERE status = 'queued'
        ORDER BY created_at ASC
        LIMIT batch_limit
        FOR UPDATE SKIP LOCKED
    LOOP
        BEGIN
            -- Determine endpoint from payload or notification type
            v_endpoint := COALESCE(
                v_notification.payload->>'endpoint',
                CASE v_notification.notification_type
                    WHEN 'employee_status_change' THEN 'employee-status-change'
                    WHEN 'new_employee_welcome' THEN 'new-employee-welcome'
                    WHEN 'manual_employee_notification' THEN 'employee-status-change'
                    ELSE 'employee-status-change'
                END
            );

            -- Send notification via HTTP
            PERFORM net.http_post(
                url := v_supabase_url || '/functions/v1/employee-notifications/' || v_endpoint,
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || v_service_key
                ),
                body := v_notification.payload
            );

            -- Mark as sent
            UPDATE public.notification_log
            SET 
                status = 'sent',
                sent_at = NOW(),
                updated_at = NOW()
            WHERE id = v_notification.id;

            v_processed := v_processed + 1;

        EXCEPTION WHEN OTHERS THEN
            -- Mark as failed with error message
            UPDATE public.notification_log
            SET 
                status = 'failed',
                error_message = SQLERRM,
                updated_at = NOW()
            WHERE id = v_notification.id;

            v_failed := v_failed + 1;
        END;
    END LOOP;

    RETURN QUERY SELECT v_processed, v_failed;
END;
$$;


ALTER FUNCTION "public"."process_notification_queue"("batch_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_pending_screenshots"("batch_limit" integer DEFAULT 100) RETURNS TABLE("processed_count" integer, "skipped_count" integer, "failed_count" integer, "elapsed_ms" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."process_pending_screenshots"("batch_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."process_pending_screenshots"("batch_limit" integer) IS 'Processes pending screenshots using heuristic analysis. Called by pg_cron every 5 minutes.';



CREATE OR REPLACE FUNCTION "public"."process_scheduled_reports_direct"("report_type" "text" DEFAULT 'all'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    config_record RECORD;
    recipients_count INTEGER;
    success_count INTEGER := 0;
    total_configs INTEGER := 0;
    report_data JSONB;
    email_result JSONB;
    email_content TEXT;
    subject TEXT;
    recipients TEXT[];
BEGIN
    -- Process each active report configuration
    FOR config_record IN
        SELECT
            rc.id,
            rc.name,
            rc.subject_template,
            rc.include_summary,
            rc.include_employee_details,
            rc.include_alerts,
            rt.template_type,
            ARRAY_AGG(rrec.email) AS recipient_emails
        FROM
            report_configurations rc
        JOIN
            report_types rt ON rc.report_type_id = rt.id
        LEFT JOIN
            report_recipients rrec ON rc.id = rrec.report_config_id AND rrec.is_active = TRUE
        WHERE
            rc.is_active = TRUE
            AND (report_type = 'all' OR rt.template_type = report_type)
        GROUP BY
            rc.id, rc.name, rc.subject_template, rc.include_summary, rc.include_employee_details, rc.include_alerts, rt.template_type
    LOOP
        total_configs := total_configs + 1;
        recipients := config_record.recipient_emails;
        recipients_count := COALESCE(ARRAY_LENGTH(recipients, 1), 0);

        IF recipients_count > 0 THEN
            -- Generate report data and content
            report_data := generate_report_data_for_config(config_record.id);
            email_content := generate_email_content_for_config(config_record, report_data);
            subject := process_subject_template(config_record.subject_template, report_data);

            -- Send email directly via Resend API
            email_result := send_email_via_resend(recipients, subject, email_content);

            -- Log the result
            IF email_result->>'success' = 'true' THEN
                INSERT INTO report_history (
                    report_config_id, 
                    recipient_count, 
                    status, 
                    email_service_id, 
                    report_data, 
                    sent_at
                ) VALUES (
                    config_record.id, 
                    recipients_count, 
                    'sent', 
                    email_result->>'email_id', 
                    report_data, 
                    NOW()
                );
                success_count := success_count + 1;
            ELSE
                INSERT INTO report_history (
                    report_config_id, 
                    recipient_count, 
                    status, 
                    error_message, 
                    report_data, 
                    sent_at
                ) VALUES (
                    config_record.id, 
                    recipients_count, 
                    'failed', 
                    email_result->>'error', 
                    report_data, 
                    NOW()
                );
            END IF;
        ELSE
            -- Log as scheduled but no recipients
            INSERT INTO report_history (
                report_config_id, 
                recipient_count, 
                status, 
                error_message, 
                report_data, 
                sent_at
            ) VALUES (
                config_record.id, 
                0, 
                'failed', 
                'No active recipients configured for this report', 
                jsonb_build_object('type', config_record.template_type, 'date', NOW()), 
                NOW()
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'Processed ' || total_configs || ' reports: ' || success_count || ' sent successfully',
        'timestamp', NOW(),
        'report_type', report_type,
        'total_configs', total_configs,
        'success_count', success_count
    );
END;
$$;


ALTER FUNCTION "public"."process_scheduled_reports_direct"("report_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_subject_template"("template" "text", "report_data" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Simple template processing - replace {date} with actual date
    RETURN REPLACE(template, '{date}', COALESCE(report_data->>'date', CURRENT_DATE::text));
END;
$$;


ALTER FUNCTION "public"."process_subject_template"("template" "text", "report_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_ai_employee_analysis"() RETURNS TABLE("users_queued" integer, "elapsed_ms" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    start_time TIMESTAMPTZ := clock_timestamp();
    v_user RECORD;
    v_count INTEGER := 0;
    v_anon_key TEXT := '***ANON_KEY_REMOVED***';
BEGIN
    -- Get users with screenshots in last 24 hours (at least 5 screenshots)
    FOR v_user IN 
        SELECT DISTINCT s.user_id
        FROM screenshots s
        WHERE s.captured_at > NOW() - INTERVAL '24 hours'
          AND s.ai_analysis_status = 'completed'
        GROUP BY s.user_id
        HAVING COUNT(*) >= 5
    LOOP
        BEGIN
            -- Queue HTTP request using pg_net
            PERFORM net.http_post(
                url := 'https://fkpiqcxkmrtaetvfgcli.supabase.co/functions/v1/comprehensive-employee-analysis',
                headers := jsonb_build_object(
                    'Authorization', 'Bearer ' || v_anon_key,
                    'Content-Type', 'application/json'
                ),
                body := jsonb_build_object(
                    'user_id', v_user.user_id,
                    'period_type', 'day'
                )
            );
            
            v_count := v_count + 1;
            
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Error queuing analysis for user %: %', v_user.user_id, SQLERRM;
        END;
    END LOOP;
    
    -- Log the result
    INSERT INTO public.system_logs (log_type, message, metadata)
    VALUES (
        'ai_automation',
        'AI Employee Analysis queued via pg_net',
        jsonb_build_object(
            'users_queued', v_count,
            'elapsed_ms', EXTRACT(MILLISECONDS FROM (clock_timestamp() - start_time))::INTEGER,
            'timestamp', NOW()
        )
    );
    
    users_queued := v_count;
    elapsed_ms := EXTRACT(MILLISECONDS FROM (clock_timestamp() - start_time))::INTEGER;
    RETURN NEXT;
END;
$$;


ALTER FUNCTION "public"."run_ai_employee_analysis"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_ai_screenshot_analyzer"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."run_ai_screenshot_analyzer"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."run_ai_screenshot_analyzer"() IS 'Finds screenshots flagged as non-work by SQL heuristic and sends them to ai-screenshot-analyzer edge function for deep AI analysis and alert creation.';



CREATE OR REPLACE FUNCTION "public"."run_insights_generator"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    result RECORD;
BEGIN
    SELECT * INTO result FROM public.generate_employee_insights('day', NULL);
    
    -- Log the result
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
END;
$$;


ALTER FUNCTION "public"."run_insights_generator"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_insights_generator_per_org"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."run_insights_generator_per_org"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."run_insights_generator_per_org"() IS 'Iterates active organizations and generates employee insights per org.';



CREATE OR REPLACE FUNCTION "public"."run_notification_processor"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_result RECORD;
BEGIN
    SELECT * INTO v_result FROM process_notification_queue(50);
    
    -- Log results if any notifications were processed
    IF v_result.processed_count > 0 OR v_result.failed_count > 0 THEN
        INSERT INTO public.system_logs (log_type, message, metadata, created_at)
        VALUES (
            'notification_processor',
            format('Processed %s notifications, %s failed', v_result.processed_count, v_result.failed_count),
            jsonb_build_object(
                'processed', v_result.processed_count,
                'failed', v_result.failed_count
            ),
            NOW()
        );
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.system_logs (log_type, message, metadata, created_at)
    VALUES (
        'notification_processor_error',
        SQLERRM,
        jsonb_build_object('sqlstate', SQLSTATE),
        NOW()
    );
END;
$$;


ALTER FUNCTION "public"."run_notification_processor"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_screenshot_cleanup"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."run_screenshot_cleanup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_screenshot_processor"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    result RECORD;
BEGIN
    SELECT * INTO result FROM public.process_pending_screenshots(100);
    
    -- Log the result
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
END;
$$;


ALTER FUNCTION "public"."run_screenshot_processor"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_system_health_alert"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."run_system_health_alert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_vision_validator"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."run_vision_validator"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."run_vision_validator"() IS 'Calls the vision-validator edge function via pg_net for perceptual hash duplicate detection. Skips if no screenshots are pending.';



CREATE OR REPLACE FUNCTION "public"."send_daily_hours_alert_per_org"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."send_daily_hours_alert_per_org"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."send_daily_hours_alert_per_org"() IS 'Iterates active organizations and calls the daily-hours-alert edge function for each one. Falls back to a single global call if no organizations exist.';



CREATE OR REPLACE FUNCTION "public"."send_email_reports_per_org"("report_type" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."send_email_reports_per_org"("report_type" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."send_email_reports_per_org"("report_type" "text") IS 'Iterates active organizations and calls email-reports edge function per org. Falls back to global call if no orgs exist.';



CREATE OR REPLACE FUNCTION "public"."send_email_via_resend"("to_emails" "text"[], "subject" "text", "html_content" "text", "from_email" "text" DEFAULT 'Ebdaa work time Reports <info@ebdaadt.com>'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    resend_api_key TEXT;
    http_result JSONB;
    email_response JSONB;
    success BOOLEAN := FALSE;
    email_id TEXT;
    error_message TEXT;
BEGIN
    -- Get the Resend API key from environment (set via Supabase dashboard)
    resend_api_key := current_setting('app.settings.resend_api_key', true);
    
    IF resend_api_key IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'RESEND_API_KEY not configured. Set it in Supabase Dashboard → Settings → Environment Variables'
        );
    END IF;

    -- Call Resend API directly
    SELECT INTO http_result net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || resend_api_key
        ),
        body := jsonb_build_object(
            'from', from_email,
            'to', to_emails,
            'subject', subject,
            'html', html_content
        )
    );

    -- Parse the response
    IF http_result->>'status' = '200' THEN
        -- Success - parse the response body
        email_response := (http_result->>'body')::jsonb;
        email_id := email_response->>'id';
        success := TRUE;
        
        RETURN jsonb_build_object(
            'success', TRUE,
            'email_id', email_id,
            'message', 'Email sent successfully',
            'recipients', array_length(to_emails, 1)
        );
    ELSE
        -- Error - get error details
        error_message := COALESCE(
            (http_result->>'body')::jsonb->>'message',
            'HTTP ' || COALESCE(http_result->>'status', 'unknown')
        );
        
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', error_message,
            'http_status', http_result->>'status'
        );
    END IF;

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'error', 'Database error: ' || SQLERRM
    );
END;
$$;


ALTER FUNCTION "public"."send_email_via_resend"("to_emails" "text"[], "subject" "text", "html_content" "text", "from_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_organization_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- If organization_id is not set, get it from the user's profile
    IF NEW.organization_id IS NULL AND NEW.user_id IS NOT NULL THEN
        SELECT organization_id INTO NEW.organization_id
        FROM public.users
        WHERE id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_organization_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_screenshot_timestamps"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- If timestamp is updated, update captured_at
  IF TG_OP = 'UPDATE' AND OLD.timestamp IS DISTINCT FROM NEW.timestamp THEN
    NEW.captured_at = NEW.timestamp;
  END IF;
  
  -- If captured_at is updated, update timestamp  
  IF TG_OP = 'UPDATE' AND OLD.captured_at IS DISTINCT FROM NEW.captured_at THEN
    NEW.timestamp = NEW.captured_at;
  END IF;
  
  -- For INSERT, ensure both are set
  IF TG_OP = 'INSERT' THEN
    IF NEW.captured_at IS NULL AND NEW.timestamp IS NOT NULL THEN
      NEW.captured_at = NEW.timestamp;
    ELSIF NEW.timestamp IS NULL AND NEW.captured_at IS NOT NULL THEN
      NEW.timestamp = NEW.captured_at;
    ELSIF NEW.captured_at IS NULL AND NEW.timestamp IS NULL THEN
      NEW.captured_at = NOW();
      NEW.timestamp = NOW();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_screenshot_timestamps"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_employee_notification"("employee_id" "uuid", "change_type" "text" DEFAULT 'joined'::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  employee_record RECORD;
  notification_payload JSONB;
  admin_name TEXT;
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'Insufficient permissions to trigger notifications';
  END IF;
  
  -- Get employee details
  SELECT * INTO employee_record
  FROM public.users
  WHERE id = employee_id AND role = 'employee';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;
  
  -- Get admin name
  SELECT COALESCE(full_name, email) INTO admin_name
  FROM public.users
  WHERE id = auth.uid();
  
  -- Build notification payload
  notification_payload := jsonb_build_object(
    'employee_id', employee_record.id,
    'employee_email', employee_record.email,
    'employee_name', COALESCE(employee_record.full_name, employee_record.email),
    'old_status', 'inactive',
    'new_status', 'active',
    'change_type', change_type,
    'changed_by', admin_name,
    'reason', 'Manual notification trigger',
    'timestamp', NOW()::text,
    'endpoint', 'employee-status-change'
  );
  
  -- Queue notification
  INSERT INTO public.notification_log (
    notification_type,
    recipient_type,
    recipient_id,
    payload,
    status,
    created_at
  ) VALUES (
    'manual_employee_notification',
    'hr_admin',
    employee_id,
    notification_payload,
    'queued',
    NOW()
  );
  
  RETURN true;
END;
$$;


ALTER FUNCTION "public"."trigger_employee_notification"("employee_id" "uuid", "change_type" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."trigger_employee_notification"("employee_id" "uuid", "change_type" "text") IS 'Manually trigger employee notifications for testing';



CREATE OR REPLACE FUNCTION "public"."trigger_fraud_alert_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Create notification for high/critical risk alerts
    IF NEW.severity IN ('HIGH', 'CRITICAL') THEN
        PERFORM create_fraud_alert_notification(NEW.id);
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_fraud_alert_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unpause_user"("target_user_id" "uuid", "admin_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Check if the admin has permission
  IF NOT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = admin_user_id 
    AND role IN ('admin', 'manager')
    AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Insufficient permissions to unpause user';
  END IF;

  -- Update the user status
  UPDATE public.users 
  SET 
    is_active = true,
    paused_at = NULL,
    paused_by = NULL,
    pause_reason = NULL,
    last_activity = NOW()
  WHERE id = target_user_id;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."unpause_user"("target_user_id" "uuid", "admin_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_ai_analysis_metrics"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Update daily metrics when analysis completes
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        INSERT INTO ai_analysis_metrics (
            date, 
            total_analyses, 
            successful_analyses,
            openai_api_calls
        ) VALUES (
            CURRENT_DATE, 
            1, 
            1,
            1
        )
        ON CONFLICT (date) DO UPDATE SET
            total_analyses = ai_analysis_metrics.total_analyses + 1,
            successful_analyses = ai_analysis_metrics.successful_analyses + 1,
            openai_api_calls = ai_analysis_metrics.openai_api_calls + 1,
            updated_at = NOW();
    
    ELSIF NEW.status = 'failed' AND OLD.status != 'failed' THEN
        INSERT INTO ai_analysis_metrics (
            date, 
            total_analyses, 
            failed_analyses
        ) VALUES (
            CURRENT_DATE, 
            1, 
            1
        )
        ON CONFLICT (date) DO UPDATE SET
            total_analyses = ai_analysis_metrics.total_analyses + 1,
            failed_analyses = ai_analysis_metrics.failed_analyses + 1,
            updated_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_ai_analysis_metrics"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_app_settings_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_app_settings_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_consecutive_duplicate_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- If this screenshot is marked as duplicate, check previous
    IF NEW.is_duplicate = TRUE THEN
        -- Get the previous screenshot's consecutive count
        SELECT COALESCE(consecutive_duplicate_count, 0) + 1
        INTO NEW.consecutive_duplicate_count
        FROM public.screenshots
        WHERE user_id = NEW.user_id
          AND id != NEW.id
          AND captured_at < NEW.captured_at
        ORDER BY captured_at DESC
        LIMIT 1;
        
        -- Default to 1 if no previous screenshot
        IF NEW.consecutive_duplicate_count IS NULL THEN
            NEW.consecutive_duplicate_count := 1;
        END IF;
    ELSE
        NEW.consecutive_duplicate_count := 0;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_consecutive_duplicate_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_manual_hours_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_manual_hours_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."url_logs_view_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_url text := coalesce(nullif(new.url,''), nullif(new.site_url,''));
BEGIN
  -- Close previous open slice for this user
  UPDATE public.app_url_activity a
     SET ended_at = greatest(coalesce(new."timestamp", now()), a.started_at)
   WHERE a.user_id = new.user_id
     AND a.ended_at IS NULL;

  IF v_url IS NULL THEN
    RETURN NULL;
  END IF;
  IF length(v_url) > 2048 THEN
    RAISE EXCEPTION 'url too long (max 2048 chars)';
  END IF;

  INSERT INTO public.app_url_activity (
    organization_id, user_id, device_id, time_log_id,
    site_url, domain, title, browser,
    started_at, created_at, privacy_flags
  )
  VALUES (
    nullif(current_setting('app.current_org', true), '')::uuid,
    new.user_id,
    nullif(current_setting('app.current_device', true), '')::uuid,
    new.time_log_id,
    v_url,
    coalesce(lower(new.domain), public._extract_domain(v_url)),
    left(coalesce(new.title, ''), 512),
    coalesce(new.browser, 'unknown'),
    coalesce(new."timestamp", now()),
    coalesce(new.created_at, now()),
    CASE 
      WHEN new.privacy_flags IS NOT NULL THEN new.privacy_flags
      ELSE jsonb_build_object(
        'domainOnly', position('/' in coalesce(split_part(v_url, '://', 2), '')) = 0 or v_url is null,
        'redactQueryHash', position('?' in coalesce(v_url,'')) = 0 and position('#' in coalesce(v_url,'')) = 0
      )
    END
  )
  RETURNING id INTO new.id;

  RETURN new;
END$$;


ALTER FUNCTION "public"."url_logs_view_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."url_logs_view_ud_block"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  raise exception 'url_logs view is read/append-only';
end$$;


ALTER FUNCTION "public"."url_logs_view_ud_block"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_user_organization"("user_email" "text", "org_slug" "text") RETURNS TABLE("user_id" "uuid", "organization_id" "uuid", "organization_name" "text", "is_valid" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id as user_id,
        o.id as organization_id,
        o.name as organization_name,
        (u.id IS NOT NULL AND o.id IS NOT NULL AND o.is_active = TRUE) as is_valid
    FROM public.organizations o
    LEFT JOIN public.users u ON u.organization_id = o.id AND u.email = user_email
    WHERE o.slug = org_slug;
END;
$$;


ALTER FUNCTION "public"."validate_user_organization"("user_email" "text", "org_slug" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "role" "text" DEFAULT 'employee'::"text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "paused_at" timestamp with time zone,
    "paused_by" "uuid",
    "pause_reason" "text",
    "last_activity" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid",
    "is_org_admin" boolean DEFAULT false,
    "is_super_admin" boolean DEFAULT false,
    "avatar_url" "text",
    CONSTRAINT "users_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'manager'::"text", 'employee'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."users"."is_active" IS 'Whether the user account is active and can be used';



COMMENT ON COLUMN "public"."users"."paused_at" IS 'When the user was paused/deactivated';



COMMENT ON COLUMN "public"."users"."paused_by" IS 'Admin user who paused this account';



COMMENT ON COLUMN "public"."users"."pause_reason" IS 'Reason for pausing the account';



COMMENT ON COLUMN "public"."users"."last_activity" IS 'Last time user was active in the system';



COMMENT ON COLUMN "public"."users"."organization_id" IS 'The organization this user belongs to';



COMMENT ON COLUMN "public"."users"."is_org_admin" IS 'Whether user can manage their organization';



COMMENT ON COLUMN "public"."users"."is_super_admin" IS 'Whether user can manage all organizations';



CREATE OR REPLACE VIEW "public"."active_employees" AS
 SELECT "id",
    "email",
    "full_name",
    "role",
    "last_activity",
    "created_at"
   FROM "public"."users"
  WHERE (("role" = 'employee'::"text") AND ("is_active" = true));


ALTER VIEW "public"."active_employees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "project_id" "uuid",
    "time_log_id" "uuid",
    "activity_type" character varying(50) NOT NULL,
    "x_position" integer,
    "y_position" integer,
    "key_pressed" character varying(10),
    "distance" double precision,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb",
    "organization_id" "uuid"
);


ALTER TABLE "public"."activities" OWNER TO "postgres";


COMMENT ON TABLE "public"."activities" IS 'Stores user input activities including mouse clicks, keystrokes, and mouse movements for time tracking';



COMMENT ON COLUMN "public"."activities"."organization_id" IS 'Organization this activity belongs to';



CREATE TABLE IF NOT EXISTS "public"."admin_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "screenshot_id" "uuid",
    "alert_type" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "category" "text",
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "ai_confidence" numeric(5,4),
    "ai_reasoning" "text",
    "vision_analysis" "jsonb" DEFAULT '{}'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "acknowledged" boolean DEFAULT false,
    "acknowledged_by" "uuid",
    "acknowledged_at" timestamp with time zone,
    "is_false_positive" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid",
    CONSTRAINT "admin_alerts_ai_confidence_check" CHECK ((("ai_confidence" >= (0)::numeric) AND ("ai_confidence" <= (1)::numeric))),
    CONSTRAINT "admin_alerts_alert_type_check" CHECK (("alert_type" = ANY (ARRAY['non_work_activity'::"text", 'extended_idle'::"text", 'consecutive_duplicates'::"text", 'potential_fraud'::"text", 'privacy_concern'::"text", 'unusual_hours'::"text", 'productivity_drop'::"text", 'suspicious_pattern'::"text"]))),
    CONSTRAINT "admin_alerts_category_check" CHECK (("category" = ANY (ARRAY['productive'::"text", 'social_media'::"text", 'entertainment'::"text", 'gaming'::"text", 'shopping'::"text", 'communication'::"text", 'other'::"text"]))),
    CONSTRAINT "admin_alerts_severity_check" CHECK (("severity" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."admin_alerts" OWNER TO "postgres";


COMMENT ON TABLE "public"."admin_alerts" IS 'Real-time alerts for admin dashboard generated by AI analysis';



COMMENT ON COLUMN "public"."admin_alerts"."alert_type" IS 'Type of alert: non_work_activity, extended_idle, consecutive_duplicates, potential_fraud, privacy_concern, unusual_hours, productivity_drop, suspicious_pattern';



COMMENT ON COLUMN "public"."admin_alerts"."severity" IS 'Alert severity: low, medium, high, critical';



COMMENT ON COLUMN "public"."admin_alerts"."ai_confidence" IS 'AI model confidence score (0-1)';



COMMENT ON COLUMN "public"."admin_alerts"."vision_analysis" IS 'JSON result from vision AI model analysis of screenshot';



COMMENT ON COLUMN "public"."admin_alerts"."organization_id" IS 'Organization this alert belongs to';



CREATE TABLE IF NOT EXISTS "public"."ai_analysis_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE,
    "total_analyses" integer DEFAULT 0,
    "successful_analyses" integer DEFAULT 0,
    "failed_analyses" integer DEFAULT 0,
    "avg_confidence_score" numeric(5,2),
    "avg_processing_time_seconds" numeric(8,2),
    "openai_api_calls" integer DEFAULT 0,
    "openai_tokens_used" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_analysis_metrics" OWNER TO "postgres";


COMMENT ON TABLE "public"."ai_analysis_metrics" IS 'Daily metrics and performance tracking for AI analysis';



CREATE TABLE IF NOT EXISTS "public"."ai_analysis_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_data" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "priority" integer DEFAULT 2,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "error_message" "text",
    "result" "jsonb",
    "retry_count" integer DEFAULT 0,
    CONSTRAINT "ai_analysis_queue_priority_check" CHECK ((("priority" >= 1) AND ("priority" <= 3))),
    CONSTRAINT "ai_analysis_queue_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."ai_analysis_queue" OWNER TO "postgres";


COMMENT ON TABLE "public"."ai_analysis_queue" IS 'Queue for AI analysis jobs with priority and retry logic';



COMMENT ON COLUMN "public"."ai_analysis_queue"."priority" IS '1=high, 2=medium, 3=low priority';



CREATE TABLE IF NOT EXISTS "public"."screenshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "time_log_id" "uuid",
    "task_id" "uuid",
    "file_path" "text" NOT NULL,
    "file_size" integer,
    "timestamp" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "activity_percent" integer DEFAULT 0,
    "focus_percent" integer DEFAULT 0,
    "mouse_clicks" integer DEFAULT 0,
    "keystrokes" integer DEFAULT 0,
    "mouse_movements" integer DEFAULT 0,
    "is_blurred" boolean DEFAULT false,
    "is_duplicate" boolean DEFAULT false,
    "vision_analysis" "jsonb",
    "consecutive_duplicate_count" integer DEFAULT 0,
    "alert_id" "uuid",
    "ai_model_used" "text",
    "vision_content" "text",
    "is_work_related" boolean,
    "active_window_title" "text",
    "app_name" "text",
    "window_title" "text",
    "url" "text",
    "captured_at" timestamp with time zone DEFAULT "now"(),
    "duplicate_reason" "text",
    "duplicate_group_hash" "text",
    "idle_inferred" boolean DEFAULT false,
    "has_context" boolean DEFAULT false,
    "duplicate_hash" "text",
    "category" "text",
    "distraction_score" integer,
    "activity_type" "text",
    "confidence_score" integer,
    "ai_analyzed_at" timestamp with time zone,
    "ai_analysis_status" "text" DEFAULT 'pending'::"text",
    "ai_metadata" "jsonb",
    "image_sha256" "text",
    "suspicion_score" numeric,
    "ai_flags" "jsonb",
    "agent_version" "text",
    "perceptual_hash" "text",
    "duplicate_matched_id" "uuid",
    "vision_validated_at" timestamp with time zone,
    "needs_vision_validation" boolean DEFAULT true,
    "organization_id" "uuid",
    "image_url" "text",
    "vision_detected_content" "text",
    "vision_category" "text",
    "vision_confidence" double precision,
    "vision_privacy_concerns" "jsonb",
    CONSTRAINT "screenshots_ai_analysis_status_check" CHECK (("ai_analysis_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"]))),
    CONSTRAINT "screenshots_confidence_score_check" CHECK ((("confidence_score" >= 0) AND ("confidence_score" <= 100))),
    CONSTRAINT "screenshots_distraction_score_check" CHECK ((("distraction_score" >= 0) AND ("distraction_score" <= 100)))
);


ALTER TABLE "public"."screenshots" OWNER TO "postgres";


COMMENT ON TABLE "public"."screenshots" IS 'Screenshots table with RLS enabled for user isolation - users can only see their own screenshots';



COMMENT ON COLUMN "public"."screenshots"."is_duplicate" IS 'Duplicate detection (Jan 2026): 
     - Idle duplicates: same hash + same window + <15min apart + <=30% activity (frozen screen)
     - Repetitive content: same hash + same window + <15min apart + >30% activity (user working but not progressing)
     Uses perceptual hash with Hamming distance thresholds: EXACT=0, NEAR=2, SIMILAR=3';



COMMENT ON COLUMN "public"."screenshots"."vision_analysis" IS 'AI vision model analysis of screenshot content';



COMMENT ON COLUMN "public"."screenshots"."consecutive_duplicate_count" IS 'Number of consecutive duplicate screenshots including this one';



COMMENT ON COLUMN "public"."screenshots"."is_work_related" IS 'AI determination if screenshot shows work-related activity';



COMMENT ON COLUMN "public"."screenshots"."active_window_title" IS 'Title of the active window when screenshot was taken';



COMMENT ON COLUMN "public"."screenshots"."app_name" IS 'Name of the application that was active';



COMMENT ON COLUMN "public"."screenshots"."window_title" IS 'Full window title text';



COMMENT ON COLUMN "public"."screenshots"."url" IS 'URL if the active window was a browser';



COMMENT ON COLUMN "public"."screenshots"."duplicate_reason" IS 'Explanation of why this screenshot was marked as a duplicate';



COMMENT ON COLUMN "public"."screenshots"."duplicate_group_hash" IS 'Hash identifying the group of duplicate screenshots this belongs to';



COMMENT ON COLUMN "public"."screenshots"."has_context" IS 'Whether this screenshot has contextual information';



COMMENT ON COLUMN "public"."screenshots"."duplicate_hash" IS 'Perceptual hash of the image content for similarity comparison';



COMMENT ON COLUMN "public"."screenshots"."category" IS 'AI-determined content category: social_media, gaming, entertainment, productive';



COMMENT ON COLUMN "public"."screenshots"."distraction_score" IS 'AI-calculated distraction score (0-100), higher = more distracting';



COMMENT ON COLUMN "public"."screenshots"."activity_type" IS 'Specific activity type detected by AI: coding, social_networking, gaming, etc.';



COMMENT ON COLUMN "public"."screenshots"."confidence_score" IS 'AI confidence in the analysis (0-100)';



COMMENT ON COLUMN "public"."screenshots"."ai_analyzed_at" IS 'Timestamp when AI analysis was completed';



COMMENT ON COLUMN "public"."screenshots"."ai_analysis_status" IS 'Current status of AI analysis processing';



COMMENT ON COLUMN "public"."screenshots"."ai_metadata" IS 'Enhanced AI analysis data: duplicate_hash, privacy_risk_score, meeting_detected, document_type, visual_elements, etc.';



COMMENT ON COLUMN "public"."screenshots"."agent_version" IS 'Desktop agent version that captured this screenshot (e.g., 1.0.124). NULL for legacy agents (<1.0.124)';



COMMENT ON COLUMN "public"."screenshots"."perceptual_hash" IS '16-character hex string representing 64-bit dHash (difference hash) computed on the desktop agent. Used for accurate visual similarity detection. Hamming distance < 10 indicates similar images.';



COMMENT ON COLUMN "public"."screenshots"."duplicate_matched_id" IS 'References the screenshot that this one was detected as a duplicate of. Used for debugging duplicate detection and understanding groupings.';



COMMENT ON COLUMN "public"."screenshots"."needs_vision_validation" IS 'Flag indicating screenshot needs Vision Validator processing. 
Defaults to TRUE so all new screenshots are automatically processed for:
- Duplicate detection via perceptual hash comparison
- AI content categorization (productive/social_media/entertainment/gaming)
- Idle state inference
Set to FALSE after Vision Validator processes the screenshot.';



COMMENT ON COLUMN "public"."screenshots"."vision_detected_content" IS 'Multimodal model text description of screenshot (same as vision_content when vision succeeds)';



CREATE OR REPLACE VIEW "public"."ai_analysis_stats" AS
 SELECT "ai_analysis_status",
    "category",
    "count"(*) AS "count",
    "avg"("distraction_score") AS "avg_distraction_score",
    "avg"("confidence_score") AS "avg_confidence_score",
    "count"(
        CASE
            WHEN (("ai_metadata" ->> 'meeting_detected'::"text") = 'true'::"text") THEN 1
            ELSE NULL::integer
        END) AS "meeting_count",
    "count"(
        CASE
            WHEN (("ai_metadata" ->> 'inappropriate_content'::"text") = 'true'::"text") THEN 1
            ELSE NULL::integer
        END) AS "inappropriate_count",
    "count"(
        CASE
            WHEN ((("ai_metadata" ->> 'privacy_risk_score'::"text"))::integer > 50) THEN 1
            ELSE NULL::integer
        END) AS "privacy_risk_count"
   FROM "public"."screenshots"
  WHERE ("captured_at" >= (CURRENT_DATE - '30 days'::interval))
  GROUP BY "ai_analysis_status", "category"
  ORDER BY ("count"(*)) DESC;


ALTER VIEW "public"."ai_analysis_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_employee_insights" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "analysis_type" "text" DEFAULT 'comprehensive'::"text",
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "insights" "jsonb" NOT NULL,
    "confidence_score" integer,
    "ai_model" "text" DEFAULT 'gpt-4o-mini'::"text",
    "analysis_version" "text" DEFAULT '1.0.0'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid",
    CONSTRAINT "ai_employee_insights_analysis_type_check" CHECK (("analysis_type" = ANY (ARRAY['comprehensive'::"text", 'productivity'::"text", 'security'::"text", 'behavioral'::"text"]))),
    CONSTRAINT "ai_employee_insights_confidence_score_check" CHECK ((("confidence_score" >= 0) AND ("confidence_score" <= 100)))
);


ALTER TABLE "public"."ai_employee_insights" OWNER TO "postgres";


COMMENT ON TABLE "public"."ai_employee_insights" IS 'Stores comprehensive AI-generated employee insights';



COMMENT ON COLUMN "public"."ai_employee_insights"."insights" IS 'JSON object containing AI analysis results from OpenAI GPT-4o-mini';



COMMENT ON COLUMN "public"."ai_employee_insights"."confidence_score" IS 'AI confidence level from 0-100';



COMMENT ON COLUMN "public"."ai_employee_insights"."organization_id" IS 'Organization this AI insight belongs to';



CREATE TABLE IF NOT EXISTS "public"."ai_user_patterns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "typical_work_hours" "jsonb" DEFAULT '{"end": 18, "days": [1, 2, 3, 4, 5], "start": 9}'::"jsonb",
    "common_apps" "jsonb" DEFAULT '[]'::"jsonb",
    "common_sites" "jsonb" DEFAULT '[]'::"jsonb",
    "productivity_by_hour" "jsonb" DEFAULT '{}'::"jsonb",
    "avg_activity_percent" numeric(5,2) DEFAULT 50,
    "avg_screenshots_per_day" integer DEFAULT 0,
    "typical_break_duration_minutes" integer DEFAULT 15,
    "typical_breaks_per_day" integer DEFAULT 4,
    "data_points_analyzed" integer DEFAULT 0,
    "last_pattern_update" timestamp with time zone DEFAULT "now"(),
    "pattern_confidence" numeric(5,4) DEFAULT 0.5,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid"
);


ALTER TABLE "public"."ai_user_patterns" OWNER TO "postgres";


COMMENT ON TABLE "public"."ai_user_patterns" IS 'Learned behavioral patterns for each user to detect anomalies';



COMMENT ON COLUMN "public"."ai_user_patterns"."typical_work_hours" IS 'JSON with start, end hours and working days';



COMMENT ON COLUMN "public"."ai_user_patterns"."productivity_by_hour" IS 'JSON mapping hour (0-23) to average productivity score';



COMMENT ON COLUMN "public"."ai_user_patterns"."organization_id" IS 'Organization this user pattern belongs to';



CREATE OR REPLACE VIEW "public"."alert_summary" AS
 SELECT "user_id",
    "count"(*) FILTER (WHERE (NOT "acknowledged")) AS "unacknowledged_count",
    "count"(*) FILTER (WHERE (("severity" = 'critical'::"text") AND (NOT "acknowledged"))) AS "critical_count",
    "count"(*) FILTER (WHERE (("severity" = 'high'::"text") AND (NOT "acknowledged"))) AS "high_count",
    "count"(*) FILTER (WHERE (("severity" = 'medium'::"text") AND (NOT "acknowledged"))) AS "medium_count",
    "count"(*) FILTER (WHERE (("severity" = 'low'::"text") AND (NOT "acknowledged"))) AS "low_count",
    "count"(*) FILTER (WHERE "is_false_positive") AS "false_positive_count",
    "max"("created_at") AS "latest_alert_at"
   FROM "public"."admin_alerts"
  GROUP BY "user_id";


ALTER VIEW "public"."alert_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "time_log_id" "uuid",
    "app_name" "text" NOT NULL,
    "window_title" "text",
    "timestamp" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "app_path" "text",
    "detected_at" bigint,
    "project_id" "uuid",
    "capture_method" "text" DEFAULT 'realtime'::"text",
    "agent_version" "text",
    "organization_id" "uuid",
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone
);


ALTER TABLE "public"."app_logs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."app_logs"."detected_at" IS 'Timestamp in milliseconds when the app was detected (for local tracking)';



COMMENT ON COLUMN "public"."app_logs"."project_id" IS 'Project associated with this app log entry';



COMMENT ON COLUMN "public"."app_logs"."agent_version" IS 'Desktop agent version that logged this app (e.g., 1.0.124). NULL for legacy agents (<1.0.124)';



CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."app_settings" IS 'Centralized application settings storage';



CREATE TABLE IF NOT EXISTS "public"."app_url_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "device_id" "uuid",
    "time_log_id" "uuid",
    "site_url" "text",
    "domain" "text",
    "title" "text",
    "browser" "text",
    "confidence" "text" DEFAULT 'low'::"text",
    "privacy_flags" "jsonb" DEFAULT '{}'::"jsonb",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "app_url_activity_confidence_check" CHECK (("confidence" = ANY (ARRAY['high'::"text", 'low'::"text"])))
);


ALTER TABLE "public"."app_url_activity" OWNER TO "postgres";


COMMENT ON COLUMN "public"."app_url_activity"."organization_id" IS 'Organization this URL activity belongs to';



CREATE OR REPLACE VIEW "public"."app_usage_analytics" AS
 SELECT "user_id",
    "app_name",
    "count"(*) AS "usage_count",
    "date_trunc"('day'::"text", "timestamp") AS "usage_date",
    EXTRACT(hour FROM "timestamp") AS "usage_hour",
    "count"(DISTINCT "time_log_id") AS "sessions_count"
   FROM "public"."app_logs" "al"
  GROUP BY "user_id", "app_name", ("date_trunc"('day'::"text", "timestamp")), (EXTRACT(hour FROM "timestamp"));


ALTER VIEW "public"."app_usage_analytics" OWNER TO "postgres";


COMMENT ON VIEW "public"."app_usage_analytics" IS 'Analytics view for application usage patterns';



CREATE TABLE IF NOT EXISTS "public"."time_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "project_id" "uuid",
    "task_id" "uuid",
    "start_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "end_time" timestamp with time zone,
    "description" "text",
    "is_manual" boolean DEFAULT false,
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_idle" boolean DEFAULT false,
    "idle_seconds" integer DEFAULT 0,
    "organization_id" "uuid",
    "deducted_seconds" integer DEFAULT 0 NOT NULL,
    "device_id" "text",
    CONSTRAINT "time_logs_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."time_logs" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."daily_activity_summary" AS
 SELECT "tl"."user_id",
    "date_trunc"('day'::"text", "tl"."start_time") AS "activity_date",
    "count"(*) AS "sessions_count",
    "sum"(EXTRACT(epoch FROM (COALESCE("tl"."end_time", "now"()) - "tl"."start_time"))) AS "total_seconds",
    "sum"("tl"."idle_seconds") AS "total_idle_seconds",
    "avg"("s"."activity_percent") AS "avg_activity_percent",
    "avg"("s"."focus_percent") AS "avg_focus_percent",
    "count"("s"."id") AS "screenshots_count"
   FROM ("public"."time_logs" "tl"
     LEFT JOIN "public"."screenshots" "s" ON (("s"."time_log_id" = "tl"."id")))
  WHERE ("tl"."start_time" IS NOT NULL)
  GROUP BY "tl"."user_id", ("date_trunc"('day'::"text", "tl"."start_time"));


ALTER VIEW "public"."daily_activity_summary" OWNER TO "postgres";


COMMENT ON VIEW "public"."daily_activity_summary" IS 'Daily summary of user activity metrics';



CREATE OR REPLACE VIEW "public"."duplicate_screenshots_summary" AS
 SELECT "user_id",
    "date"("captured_at") AS "date",
    "count"(*) AS "total_duplicates",
    "count"(DISTINCT "duplicate_group_hash") AS "duplicate_groups",
    "avg"("activity_percent") AS "avg_activity_percent",
    "min"("captured_at") AS "first_duplicate_at",
    "max"("captured_at") AS "last_duplicate_at"
   FROM "public"."screenshots"
  WHERE ("is_duplicate" = true)
  GROUP BY "user_id", ("date"("captured_at"))
  ORDER BY ("date"("captured_at")) DESC;


ALTER VIEW "public"."duplicate_screenshots_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_analysis_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "requested_by" "uuid",
    "analysis_period" "text" NOT NULL,
    "analysis_type" "text" DEFAULT 'comprehensive'::"text",
    "start_date" "date",
    "end_date" "date",
    "status" "text" DEFAULT 'pending'::"text",
    "data_points_analyzed" integer DEFAULT 0,
    "processing_time_ms" integer,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "organization_id" "uuid",
    CONSTRAINT "employee_analysis_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."employee_analysis_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."employee_analysis_requests" IS 'Tracks analysis requests and their processing status for monitoring and debugging';



COMMENT ON COLUMN "public"."employee_analysis_requests"."organization_id" IS 'Organization this analysis request belongs to';



CREATE TABLE IF NOT EXISTS "public"."employee_behavioral_patterns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "pattern_date" "date" NOT NULL,
    "work_style_description" "text",
    "communication_patterns" "text",
    "break_patterns" "text",
    "multitasking_behavior" "text",
    "focus_consistency" "text",
    "stress_indicators" "text"[],
    "positive_behaviors" "text"[],
    "areas_for_improvement" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid"
);


ALTER TABLE "public"."employee_behavioral_patterns" OWNER TO "postgres";


COMMENT ON TABLE "public"."employee_behavioral_patterns" IS 'Behavioral patterns and work style analysis for employee development';



COMMENT ON COLUMN "public"."employee_behavioral_patterns"."organization_id" IS 'Organization this behavioral pattern belongs to';



CREATE TABLE IF NOT EXISTS "public"."employee_comprehensive_analysis" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "analysis_date" "date" NOT NULL,
    "analysis_data" "jsonb" NOT NULL,
    "confidence_score" integer DEFAULT 0,
    "productivity_score" integer DEFAULT 0,
    "security_risk_level" "text" DEFAULT 'low'::"text",
    "flags_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid",
    CONSTRAINT "employee_comprehensive_analysis_security_risk_level_check" CHECK (("security_risk_level" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."employee_comprehensive_analysis" OWNER TO "postgres";


COMMENT ON TABLE "public"."employee_comprehensive_analysis" IS 'Stores comprehensive AI-powered employee analysis results including productivity, behavioral, and security insights';



COMMENT ON COLUMN "public"."employee_comprehensive_analysis"."organization_id" IS 'Organization this analysis belongs to';



CREATE TABLE IF NOT EXISTS "public"."employee_daily_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "activity_date" "date" NOT NULL,
    "work_description" "text",
    "productivity_score" integer DEFAULT 0,
    "main_applications" "text"[],
    "websites_visited" "text"[],
    "behavioral_notes" "text",
    "focus_time_blocks" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid"
);


ALTER TABLE "public"."employee_daily_activities" OWNER TO "postgres";


COMMENT ON TABLE "public"."employee_daily_activities" IS 'Daily activity summaries extracted from comprehensive analysis for quick access';



COMMENT ON COLUMN "public"."employee_daily_activities"."organization_id" IS 'Organization this daily activity belongs to';



CREATE TABLE IF NOT EXISTS "public"."employee_deductions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "month_year" "date" NOT NULL,
    "deduction_type" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "reason" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid",
    CONSTRAINT "employee_deductions_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "employee_deductions_deduction_type_check" CHECK (("deduction_type" = ANY (ARRAY['late'::"text", 'absent'::"text", 'disciplinary'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."employee_deductions" OWNER TO "postgres";


COMMENT ON TABLE "public"."employee_deductions" IS 'Manual deductions applied to employee salaries';



COMMENT ON COLUMN "public"."employee_deductions"."organization_id" IS 'Organization this deduction belongs to';



CREATE TABLE IF NOT EXISTS "public"."employee_management_insights" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "insight_date" "date" NOT NULL,
    "performance_feedback" "text",
    "coaching_opportunities" "text"[],
    "workload_adjustments" "text"[],
    "skill_development_suggestions" "text"[],
    "team_collaboration_insights" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid"
);


ALTER TABLE "public"."employee_management_insights" OWNER TO "postgres";


COMMENT ON TABLE "public"."employee_management_insights" IS 'Management recommendations and coaching insights for employee development';



COMMENT ON COLUMN "public"."employee_management_insights"."organization_id" IS 'Organization this management insight belongs to';



CREATE TABLE IF NOT EXISTS "public"."employee_project_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "assigned_by" "uuid",
    "assigned_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid"
);


ALTER TABLE "public"."employee_project_assignments" OWNER TO "postgres";


COMMENT ON TABLE "public"."employee_project_assignments" IS 'Manages which projects employees are assigned to';



COMMENT ON COLUMN "public"."employee_project_assignments"."assigned_by" IS 'The admin user who assigned this project to the employee';



COMMENT ON COLUMN "public"."employee_project_assignments"."organization_id" IS 'Organization this assignment belongs to';



CREATE TABLE IF NOT EXISTS "public"."employee_warnings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "month_year" "date" NOT NULL,
    "warning_type" "text" NOT NULL,
    "severity" "text" DEFAULT 'medium'::"text",
    "message" "text" NOT NULL,
    "required_value" numeric(10,2),
    "actual_value" numeric(10,2),
    "gap_percentage" numeric(5,2),
    "is_reviewed" boolean DEFAULT false,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid",
    CONSTRAINT "employee_warnings_severity_check" CHECK (("severity" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"]))),
    CONSTRAINT "employee_warnings_warning_type_check" CHECK (("warning_type" = ANY (ARRAY['below_hours'::"text", 'below_days'::"text", 'productivity_low'::"text", 'attendance_issue'::"text"])))
);


ALTER TABLE "public"."employee_warnings" OWNER TO "postgres";


COMMENT ON TABLE "public"."employee_warnings" IS 'System-generated and manual warnings for employee compliance';



COMMENT ON COLUMN "public"."employee_warnings"."organization_id" IS 'Organization this warning belongs to';



CREATE TABLE IF NOT EXISTS "public"."employee_working_standards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "employment_type" "text" NOT NULL,
    "required_hours_monthly" numeric(10,2) DEFAULT 160,
    "required_days_monthly" integer DEFAULT 22,
    "minimum_hours_daily" numeric(10,2) DEFAULT 8,
    "overtime_threshold" numeric(10,2) DEFAULT 160,
    "warning_threshold_percentage" numeric(5,2) DEFAULT 90,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid",
    CONSTRAINT "employee_working_standards_employment_type_check" CHECK (("employment_type" = ANY (ARRAY['monthly'::"text", 'hourly'::"text"])))
);


ALTER TABLE "public"."employee_working_standards" OWNER TO "postgres";


COMMENT ON TABLE "public"."employee_working_standards" IS 'Working requirements and thresholds for each employee';



COMMENT ON COLUMN "public"."employee_working_standards"."organization_id" IS 'Organization this working standard belongs to';



CREATE TABLE IF NOT EXISTS "public"."fraud_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "time_log_id" "uuid",
    "alert_type" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "risk_score" numeric(5,2) DEFAULT 0 NOT NULL,
    "confidence" numeric(5,2) DEFAULT 0,
    "suspicious_patterns" "jsonb" DEFAULT '[]'::"jsonb",
    "detection_details" "jsonb" DEFAULT '{}'::"jsonb",
    "behavior_analysis" "jsonb" DEFAULT '{}'::"jsonb",
    "screenshot_context" "jsonb" DEFAULT '{}'::"jsonb",
    "activity_context" "jsonb" DEFAULT '{}'::"jsonb",
    "system_context" "jsonb" DEFAULT '{}'::"jsonb",
    "is_reviewed" boolean DEFAULT false,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "review_notes" "text",
    "is_false_positive" boolean DEFAULT false,
    "detected_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid",
    CONSTRAINT "fraud_alerts_confidence_check" CHECK ((("confidence" >= (0)::numeric) AND ("confidence" <= (100)::numeric))),
    CONSTRAINT "fraud_alerts_risk_score_check" CHECK ((("risk_score" >= (0)::numeric) AND ("risk_score" <= (100)::numeric))),
    CONSTRAINT "fraud_alerts_severity_check" CHECK (("severity" = ANY (ARRAY['LOW'::"text", 'MEDIUM'::"text", 'HIGH'::"text", 'CRITICAL'::"text"])))
);


ALTER TABLE "public"."fraud_alerts" OWNER TO "postgres";


COMMENT ON TABLE "public"."fraud_alerts" IS 'Real-time fraud alerts from desktop agent anti-cheat detection system';



COMMENT ON COLUMN "public"."fraud_alerts"."alert_type" IS 'Type of suspicious activity detected (mouse_jiggling, keyboard_patterns, etc.)';



COMMENT ON COLUMN "public"."fraud_alerts"."risk_score" IS 'Risk score from 0-100 calculated by anti-cheat detector';



COMMENT ON COLUMN "public"."fraud_alerts"."suspicious_patterns" IS 'Array of suspicious behavior patterns detected';



COMMENT ON COLUMN "public"."fraud_alerts"."detection_details" IS 'Detailed analysis and metrics from the detection algorithm';



COMMENT ON COLUMN "public"."fraud_alerts"."organization_id" IS 'Organization this fraud alert belongs to';



CREATE TABLE IF NOT EXISTS "public"."idle_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "time_log_id" "uuid",
    "idle_start" timestamp with time zone NOT NULL,
    "idle_end" timestamp with time zone NOT NULL,
    "duration_seconds" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid"
);


ALTER TABLE "public"."idle_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."idle_logs" IS 'Tracks idle periods for accurate time logging';



CREATE OR REPLACE VIEW "public"."idle_analytics" AS
 SELECT "user_id",
    "date_trunc"('day'::"text", "idle_start") AS "idle_date",
    "sum"("duration_seconds") AS "total_idle_seconds",
    "count"(*) AS "idle_periods_count",
    "avg"("duration_seconds") AS "avg_idle_duration",
    "max"("duration_seconds") AS "max_idle_duration"
   FROM "public"."idle_logs" "il"
  GROUP BY "user_id", ("date_trunc"('day'::"text", "idle_start"));


ALTER VIEW "public"."idle_analytics" OWNER TO "postgres";


COMMENT ON VIEW "public"."idle_analytics" IS 'Analytics view for idle time patterns';



CREATE OR REPLACE VIEW "public"."inactive_employees" AS
 SELECT "id",
    "email",
    "full_name",
    "role",
    "paused_at",
    "paused_by",
    "pause_reason",
    ( SELECT "users_1"."full_name"
           FROM "public"."users" "users_1"
          WHERE ("users_1"."id" = "users_1"."paused_by")) AS "paused_by_name",
    "created_at"
   FROM "public"."users"
  WHERE (("role" = 'employee'::"text") AND ("is_active" = false));


ALTER VIEW "public"."inactive_employees" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."latest_employee_analysis" AS
 SELECT "eca"."id",
    "eca"."user_id",
    "eca"."analysis_date",
    "eca"."analysis_data",
    "eca"."confidence_score",
    "eca"."productivity_score",
    "eca"."security_risk_level",
    "eca"."flags_count",
    "eca"."created_at",
    "eca"."updated_at",
    "u"."full_name" AS "employee_name",
    "u"."email" AS "employee_email",
    "u"."role" AS "employee_role"
   FROM ("public"."employee_comprehensive_analysis" "eca"
     JOIN "public"."users" "u" ON (("eca"."user_id" = "u"."id")))
  WHERE ("eca"."analysis_date" = ( SELECT "max"("eca2"."analysis_date") AS "max"
           FROM "public"."employee_comprehensive_analysis" "eca2"
          WHERE ("eca2"."user_id" = "eca"."user_id")));


ALTER VIEW "public"."latest_employee_analysis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."manual_hours" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "date" "date" NOT NULL,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "total_minutes" integer NOT NULL,
    "reason" "text" NOT NULL,
    "project" "text",
    "task" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_deleted" boolean DEFAULT false,
    CONSTRAINT "manual_hours_total_minutes_check" CHECK (("total_minutes" > 0))
);


ALTER TABLE "public"."manual_hours" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."manual_hours_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "manual_hours_id" "uuid",
    "action" "text" NOT NULL,
    "changed_by" "uuid" NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "now"(),
    "old_data" "jsonb",
    "new_data" "jsonb"
);


ALTER TABLE "public"."manual_hours_audit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "notification_type" "text" NOT NULL,
    "recipient_type" "text" NOT NULL,
    "recipient_id" "uuid",
    "payload" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "error_message" "text",
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid",
    CONSTRAINT "notification_log_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'queued'::"text", 'sent'::"text", 'failed'::"text", 'retry'::"text"])))
);


ALTER TABLE "public"."notification_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."notification_log" IS 'Logs all notification attempts for audit and debugging';



COMMENT ON COLUMN "public"."notification_log"."organization_id" IS 'Organization this notification belongs to';



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "type" "text" DEFAULT 'info'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid"
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


COMMENT ON TABLE "public"."notifications" IS 'System notifications for users';



COMMENT ON COLUMN "public"."notifications"."organization_id" IS 'Organization this notification belongs to';



CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "logo_url" "text",
    "is_active" boolean DEFAULT true,
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


COMMENT ON TABLE "public"."organizations" IS 'Multi-tenant organizations/companies';



COMMENT ON COLUMN "public"."organizations"."slug" IS 'URL-friendly unique identifier for login';



COMMENT ON COLUMN "public"."organizations"."settings" IS 'JSON settings for the organization (timezone, etc.)';



CREATE OR REPLACE VIEW "public"."perceptual_hash_duplicates" AS
 SELECT "user_id",
    "perceptual_hash",
    "count"(*) AS "duplicate_count",
    "min"("captured_at") AS "first_seen",
    "max"("captured_at") AS "last_seen",
    "avg"("activity_percent") AS "avg_activity",
    "date"("min"("captured_at")) AS "date"
   FROM "public"."screenshots"
  WHERE ("perceptual_hash" IS NOT NULL)
  GROUP BY "user_id", "perceptual_hash"
 HAVING ("count"(*) > 1)
  ORDER BY ("count"(*)) DESC, ("max"("captured_at")) DESC;


ALTER VIEW "public"."perceptual_hash_duplicates" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."productivity_metrics" AS
 SELECT "u"."id" AS "user_id",
    "u"."email",
    "das"."activity_date",
    "das"."total_seconds",
    "das"."total_idle_seconds",
    "das"."avg_activity_percent",
    "das"."avg_focus_percent",
        CASE
            WHEN ("das"."total_seconds" > (0)::numeric) THEN "round"(((("das"."total_seconds" - ("das"."total_idle_seconds")::numeric) / "das"."total_seconds") * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS "productivity_score",
        CASE
            WHEN (("das"."avg_activity_percent" >= (80)::numeric) AND ("das"."avg_focus_percent" >= (80)::numeric)) THEN 'High'::"text"
            WHEN (("das"."avg_activity_percent" >= (60)::numeric) AND ("das"."avg_focus_percent" >= (60)::numeric)) THEN 'Medium'::"text"
            ELSE 'Low'::"text"
        END AS "productivity_level"
   FROM ("public"."users" "u"
     LEFT JOIN "public"."daily_activity_summary" "das" ON (("das"."user_id" = "u"."id")))
  WHERE ("das"."activity_date" IS NOT NULL);


ALTER VIEW "public"."productivity_metrics" OWNER TO "postgres";


COMMENT ON VIEW "public"."productivity_metrics" IS 'Comprehensive productivity scoring and metrics';



CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "color" "text" DEFAULT '#3B82F6'::"text",
    "is_active" boolean DEFAULT true,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid"
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."report_configurations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_type_id" "uuid",
    "name" character varying(200) NOT NULL,
    "description" "text",
    "schedule_cron" character varying(100),
    "schedule_description" character varying(200),
    "is_active" boolean DEFAULT true,
    "subject_template" "text" NOT NULL,
    "include_summary" boolean DEFAULT true,
    "include_employee_details" boolean DEFAULT true,
    "include_alerts" boolean DEFAULT true,
    "include_projects" boolean DEFAULT true,
    "alert_settings" "jsonb" DEFAULT '{}'::"jsonb",
    "filters" "jsonb" DEFAULT '{}'::"jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid"
);


ALTER TABLE "public"."report_configurations" OWNER TO "postgres";


COMMENT ON TABLE "public"."report_configurations" IS 'Email report configurations. Automated sending is handled by pg_cron jobs (daily-email-report-v2, weekly-email-report-v2) that trigger the email-reports Edge Function.';



COMMENT ON COLUMN "public"."report_configurations"."organization_id" IS 'Organization this report config belongs to';



CREATE TABLE IF NOT EXISTS "public"."report_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_config_id" "uuid",
    "sent_at" timestamp with time zone DEFAULT "now"(),
    "recipient_count" integer DEFAULT 0,
    "status" character varying(50) DEFAULT 'sent'::character varying,
    "error_message" "text",
    "email_service_id" character varying(100),
    "report_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid"
);


ALTER TABLE "public"."report_history" OWNER TO "postgres";


COMMENT ON TABLE "public"."report_history" IS 'History of sent reports for tracking and debugging';



COMMENT ON COLUMN "public"."report_history"."organization_id" IS 'Organization this report history belongs to';



CREATE TABLE IF NOT EXISTS "public"."report_recipients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_config_id" "uuid",
    "user_id" "uuid",
    "email" character varying(255) NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid"
);


ALTER TABLE "public"."report_recipients" OWNER TO "postgres";


COMMENT ON TABLE "public"."report_recipients" IS 'Users who should receive specific reports';



COMMENT ON COLUMN "public"."report_recipients"."organization_id" IS 'Organization this recipient belongs to';



CREATE TABLE IF NOT EXISTS "public"."report_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "description" "text",
    "template_type" character varying(50) NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."report_types" OWNER TO "postgres";


COMMENT ON TABLE "public"."report_types" IS 'Types of reports that can be generated (daily, weekly, etc.)';



CREATE TABLE IF NOT EXISTS "public"."screenshot_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "screenshot_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "comment" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."screenshot_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."screenshot_deletions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "screenshot_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "time_log_id" "uuid",
    "organization_id" "uuid",
    "deleted_by" "uuid" NOT NULL,
    "deleted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deducted_seconds" integer DEFAULT 0 NOT NULL,
    "screenshot_captured_at" timestamp with time zone NOT NULL,
    "image_url" "text",
    "deletion_source" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "screenshot_deletions_deletion_source_check" CHECK (("deletion_source" = ANY (ARRAY['desktop_agent'::"text", 'web_admin'::"text"])))
);


ALTER TABLE "public"."screenshot_deletions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."settings" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."settings" IS 'Application settings. Set resend_api_key here or in Supabase Dashboard → Settings → Environment Variables';



COMMENT ON COLUMN "public"."settings"."value" IS 'Value for the setting. For resend_api_key, use your actual Resend API key from https://resend.com/api-keys';



CREATE TABLE IF NOT EXISTS "public"."suspicious_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "activity_type" "text" NOT NULL,
    "risk_score" integer DEFAULT 0,
    "details" "text",
    "category" "text",
    "timestamp" timestamp with time zone DEFAULT "now"(),
    "reviewed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid",
    CONSTRAINT "suspicious_activity_risk_score_check" CHECK ((("risk_score" >= 0) AND ("risk_score" <= 100)))
);


ALTER TABLE "public"."suspicious_activity" OWNER TO "postgres";


COMMENT ON TABLE "public"."suspicious_activity" IS 'Stores automatically detected suspicious activities';



COMMENT ON COLUMN "public"."suspicious_activity"."activity_type" IS 'Type of suspicious activity (social_media_usage, entertainment_usage, etc.)';



COMMENT ON COLUMN "public"."suspicious_activity"."risk_score" IS 'Risk score from 0-100 based on severity';



COMMENT ON COLUMN "public"."suspicious_activity"."details" IS 'Detailed description of the suspicious activity';



COMMENT ON COLUMN "public"."suspicious_activity"."category" IS 'Category of the activity (social_media, entertainment, gaming, etc.)';



COMMENT ON COLUMN "public"."suspicious_activity"."reviewed" IS 'Whether this activity has been reviewed by admin';



COMMENT ON COLUMN "public"."suspicious_activity"."organization_id" IS 'Organization this suspicious activity belongs to';



CREATE TABLE IF NOT EXISTS "public"."system_checks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "check_type" character varying(50) NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_agent" "text",
    "test_data" "jsonb" DEFAULT '{}'::"jsonb",
    "status" character varying(20) DEFAULT 'pending'::character varying,
    "completed_at" timestamp with time zone,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."system_checks" OWNER TO "postgres";


COMMENT ON TABLE "public"."system_checks" IS 'Stores system check test data and results for debugging and validation';



CREATE TABLE IF NOT EXISTS "public"."system_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "log_type" "text" NOT NULL,
    "message" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."system_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."system_logs" IS 'System monitoring and performance logs for ChatGPT analysis';



CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid"
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_leader_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_leader_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "assigned_by" "uuid"
);


ALTER TABLE "public"."team_leader_assignments" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."url_logs" WITH ("security_barrier"='true') AS
 SELECT "id",
    "site_url" AS "url",
    "site_url",
    "title",
    "domain",
    "browser",
    "started_at" AS "timestamp",
    "time_log_id",
    "user_id",
    "created_at"
   FROM "public"."app_url_activity" "a";


ALTER VIEW "public"."url_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."url_logs_old" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "time_log_id" "uuid",
    "url" "text" NOT NULL,
    "title" "text",
    "domain" "text",
    "browser" "text",
    "timestamp" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."url_logs_old" OWNER TO "postgres";


COMMENT ON TABLE "public"."url_logs_old" IS 'Tracks browser URL visits for productivity analysis';



CREATE OR REPLACE VIEW "public"."url_usage_analytics" AS
 SELECT "user_id",
    "domain",
    "count"(*) AS "visit_count",
    "date_trunc"('day'::"text", "timestamp") AS "visit_date",
    EXTRACT(hour FROM "timestamp") AS "visit_hour",
    "count"(DISTINCT "time_log_id") AS "sessions_count"
   FROM "public"."url_logs_old" "ul"
  GROUP BY "user_id", "domain", ("date_trunc"('day'::"text", "timestamp")), (EXTRACT(hour FROM "timestamp"));


ALTER VIEW "public"."url_usage_analytics" OWNER TO "postgres";


COMMENT ON VIEW "public"."url_usage_analytics" IS 'Analytics view for website usage patterns';



CREATE OR REPLACE VIEW "public"."user_agent_versions" AS
 SELECT DISTINCT ON ("user_id") "user_id",
    "agent_version",
    "created_at" AS "last_seen"
   FROM "public"."app_logs"
  WHERE ("agent_version" IS NOT NULL)
  ORDER BY "user_id", "created_at" DESC;


ALTER VIEW "public"."user_agent_versions" OWNER TO "postgres";


COMMENT ON VIEW "public"."user_agent_versions" IS 'Shows the latest agent version used by each user based on app_logs';



CREATE TABLE IF NOT EXISTS "public"."user_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invite_token" "text" NOT NULL,
    "email" "text",
    "role" "text" DEFAULT 'employee'::"text",
    "invited_by" "uuid",
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "used_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid",
    CONSTRAINT "user_invites_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'manager'::"text", 'employee'::"text"])))
);


ALTER TABLE "public"."user_invites" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_invites" IS 'Manages invite links for new users';



COMMENT ON COLUMN "public"."user_invites"."organization_id" IS 'Organization this invite belongs to';



CREATE TABLE IF NOT EXISTS "public"."vision_analysis_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "validator_run_id" "text" NOT NULL,
    "execution_duration_ms" integer,
    "screenshots_processed" integer,
    "screenshots_failed" integer,
    "api_calls_made" integer,
    "duplicates_confirmed" integer,
    "duplicates_rejected" integer,
    "status" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "api_errors" "text"[],
    "api_rate_limit_remaining" integer,
    "api_rate_limit_reset_at" timestamp with time zone,
    "error_message" "text",
    "false_positives_caught" integer,
    "metadata" "jsonb",
    "privacy_alerts_created" integer,
    "total_screenshots_flagged" integer,
    "vision_validation_rate" double precision
);


ALTER TABLE "public"."vision_analysis_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vision_feature_flags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vision_validation_enabled" boolean DEFAULT true,
    "max_screenshots_per_run" integer DEFAULT 20,
    "run_interval_minutes" integer DEFAULT 10,
    "validate_duplicates" boolean DEFAULT true,
    "validate_low_activity" boolean DEFAULT true,
    "validate_suspicious" boolean DEFAULT true,
    "random_sample_percentage" integer DEFAULT 100,
    "daily_api_call_limit" integer DEFAULT 10000,
    "hourly_api_call_limit" integer DEFAULT 500,
    "backoff_multiplier" numeric DEFAULT 2,
    "low_activity_threshold" integer DEFAULT 10,
    "alert_on_rate_limit_percent" integer DEFAULT 80,
    "alert_on_queue_backlog" integer DEFAULT 100,
    "alert_on_error_rate_percent" integer DEFAULT 10,
    "metrics_retention_days" integer DEFAULT 30,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid",
    "reason" "text"
);


ALTER TABLE "public"."vision_feature_flags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."warning_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "warning_message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "shown_at" timestamp with time zone DEFAULT "now"(),
    "dismissed_at" timestamp with time zone,
    "action_taken" "text",
    "user_response" "text",
    "context" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid"
);


ALTER TABLE "public"."warning_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."warning_logs" IS 'Logs when warnings are shown to users and their responses';



COMMENT ON COLUMN "public"."warning_logs"."organization_id" IS 'Organization this warning log belongs to';



CREATE TABLE IF NOT EXISTS "public"."warning_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "severity" "text" DEFAULT 'medium'::"text",
    "target_audience" "text" DEFAULT 'all'::"text",
    "target_user_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "is_active" boolean DEFAULT true,
    "display_frequency" "text" DEFAULT 'always'::"text",
    "trigger_conditions" "jsonb" DEFAULT '{}'::"jsonb",
    "created_by" "uuid" NOT NULL,
    "valid_from" timestamp with time zone DEFAULT "now"(),
    "valid_until" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid",
    CONSTRAINT "warning_messages_display_frequency_check" CHECK (("display_frequency" = ANY (ARRAY['always'::"text", 'once'::"text", 'daily'::"text", 'weekly'::"text"]))),
    CONSTRAINT "warning_messages_severity_check" CHECK (("severity" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"]))),
    CONSTRAINT "warning_messages_target_audience_check" CHECK (("target_audience" = ANY (ARRAY['all'::"text", 'employee'::"text", 'specific'::"text"])))
);


ALTER TABLE "public"."warning_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."warning_messages" IS 'Stores customizable warning messages that can be shown to employees';



COMMENT ON COLUMN "public"."warning_messages"."organization_id" IS 'Organization this warning message belongs to for multi-tenant filtering';



CREATE TABLE IF NOT EXISTS "public"."warning_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "severity" "text" DEFAULT 'medium'::"text",
    "category" "text" NOT NULL,
    "description" "text",
    "is_system" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "warning_templates_severity_check" CHECK (("severity" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."warning_templates" OWNER TO "postgres";


COMMENT ON TABLE "public"."warning_templates" IS 'Predefined warning message templates for common scenarios';



CREATE TABLE IF NOT EXISTS "public"."worker_status" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "worker_type" "text" NOT NULL,
    "is_running" boolean DEFAULT true,
    "last_run" timestamp with time zone,
    "next_run" timestamp with time zone,
    "last_processed_count" integer DEFAULT 0,
    "error_rate" numeric(5,2) DEFAULT 0,
    "error_count" integer DEFAULT 0,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."worker_status" OWNER TO "postgres";


COMMENT ON TABLE "public"."worker_status" IS 'Tracks status and health of AI worker processes';



COMMENT ON COLUMN "public"."worker_status"."error_rate" IS 'Percentage of failed analyses in last 24 hours';



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_alerts"
    ADD CONSTRAINT "admin_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_analysis_metrics"
    ADD CONSTRAINT "ai_analysis_metrics_date_key" UNIQUE ("date");



ALTER TABLE ONLY "public"."ai_analysis_metrics"
    ADD CONSTRAINT "ai_analysis_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_analysis_queue"
    ADD CONSTRAINT "ai_analysis_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_employee_insights"
    ADD CONSTRAINT "ai_employee_insights_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_user_patterns"
    ADD CONSTRAINT "ai_user_patterns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_user_patterns"
    ADD CONSTRAINT "ai_user_patterns_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."app_logs"
    ADD CONSTRAINT "app_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_url_activity"
    ADD CONSTRAINT "app_url_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_analysis_requests"
    ADD CONSTRAINT "employee_analysis_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_behavioral_patterns"
    ADD CONSTRAINT "employee_behavioral_patterns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_behavioral_patterns"
    ADD CONSTRAINT "employee_behavioral_patterns_user_id_pattern_date_key" UNIQUE ("user_id", "pattern_date");



ALTER TABLE ONLY "public"."employee_comprehensive_analysis"
    ADD CONSTRAINT "employee_comprehensive_analysis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_comprehensive_analysis"
    ADD CONSTRAINT "employee_comprehensive_analysis_user_id_analysis_date_key" UNIQUE ("user_id", "analysis_date");



ALTER TABLE ONLY "public"."employee_daily_activities"
    ADD CONSTRAINT "employee_daily_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_daily_activities"
    ADD CONSTRAINT "employee_daily_activities_user_id_activity_date_key" UNIQUE ("user_id", "activity_date");



ALTER TABLE ONLY "public"."employee_deductions"
    ADD CONSTRAINT "employee_deductions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_management_insights"
    ADD CONSTRAINT "employee_management_insights_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_management_insights"
    ADD CONSTRAINT "employee_management_insights_user_id_insight_date_key" UNIQUE ("user_id", "insight_date");



ALTER TABLE ONLY "public"."employee_project_assignments"
    ADD CONSTRAINT "employee_project_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_project_assignments"
    ADD CONSTRAINT "employee_project_assignments_user_id_project_id_key" UNIQUE ("user_id", "project_id");



ALTER TABLE ONLY "public"."employee_warnings"
    ADD CONSTRAINT "employee_warnings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_working_standards"
    ADD CONSTRAINT "employee_working_standards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_working_standards"
    ADD CONSTRAINT "employee_working_standards_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."fraud_alerts"
    ADD CONSTRAINT "fraud_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."idle_logs"
    ADD CONSTRAINT "idle_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."manual_hours_audit"
    ADD CONSTRAINT "manual_hours_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."manual_hours"
    ADD CONSTRAINT "manual_hours_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_log"
    ADD CONSTRAINT "notification_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_configurations"
    ADD CONSTRAINT "report_configurations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_history"
    ADD CONSTRAINT "report_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_recipients"
    ADD CONSTRAINT "report_recipients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_recipients"
    ADD CONSTRAINT "report_recipients_report_config_id_user_id_key" UNIQUE ("report_config_id", "user_id");



ALTER TABLE ONLY "public"."report_types"
    ADD CONSTRAINT "report_types_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."report_types"
    ADD CONSTRAINT "report_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."screenshot_comments"
    ADD CONSTRAINT "screenshot_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."screenshot_deletions"
    ADD CONSTRAINT "screenshot_deletions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."screenshots"
    ADD CONSTRAINT "screenshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."suspicious_activity"
    ADD CONSTRAINT "suspicious_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_checks"
    ADD CONSTRAINT "system_checks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_logs"
    ADD CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_leader_assignments"
    ADD CONSTRAINT "team_leader_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_leader_assignments"
    ADD CONSTRAINT "team_leader_assignments_team_leader_id_employee_id_key" UNIQUE ("team_leader_id", "employee_id");



ALTER TABLE ONLY "public"."time_logs"
    ADD CONSTRAINT "time_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."url_logs_old"
    ADD CONSTRAINT "url_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_invites"
    ADD CONSTRAINT "user_invites_invite_token_key" UNIQUE ("invite_token");



ALTER TABLE ONLY "public"."user_invites"
    ADD CONSTRAINT "user_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vision_analysis_metrics"
    ADD CONSTRAINT "vision_analysis_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vision_feature_flags"
    ADD CONSTRAINT "vision_feature_flags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."warning_logs"
    ADD CONSTRAINT "warning_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."warning_messages"
    ADD CONSTRAINT "warning_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."warning_templates"
    ADD CONSTRAINT "warning_templates_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."warning_templates"
    ADD CONSTRAINT "warning_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."worker_status"
    ADD CONSTRAINT "worker_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."worker_status"
    ADD CONSTRAINT "worker_status_worker_type_key" UNIQUE ("worker_type");



CREATE INDEX "activities_activity_type_idx" ON "public"."activities" USING "btree" ("activity_type");



CREATE INDEX "activities_created_at_idx" ON "public"."activities" USING "btree" ("created_at");



CREATE INDEX "activities_time_log_id_idx" ON "public"."activities" USING "btree" ("time_log_id");



CREATE INDEX "activities_user_id_idx" ON "public"."activities" USING "btree" ("user_id");



CREATE INDEX "brin_app_url_activity_started_at" ON "public"."app_url_activity" USING "brin" ("started_at");



CREATE INDEX "idx_activities_organization_id" ON "public"."activities" USING "btree" ("organization_id");



CREATE INDEX "idx_admin_alerts_created_at" ON "public"."admin_alerts" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_admin_alerts_organization_id" ON "public"."admin_alerts" USING "btree" ("organization_id");



CREATE INDEX "idx_admin_alerts_screenshot" ON "public"."admin_alerts" USING "btree" ("screenshot_id") WHERE ("screenshot_id" IS NOT NULL);



CREATE INDEX "idx_admin_alerts_severity" ON "public"."admin_alerts" USING "btree" ("severity");



CREATE INDEX "idx_admin_alerts_type" ON "public"."admin_alerts" USING "btree" ("alert_type");



CREATE INDEX "idx_admin_alerts_unacknowledged" ON "public"."admin_alerts" USING "btree" ("acknowledged", "created_at" DESC) WHERE ("acknowledged" = false);



CREATE INDEX "idx_admin_alerts_user_id" ON "public"."admin_alerts" USING "btree" ("user_id");



CREATE INDEX "idx_ai_employee_insights_organization_id" ON "public"."ai_employee_insights" USING "btree" ("organization_id");



CREATE INDEX "idx_ai_insights_created_at" ON "public"."ai_employee_insights" USING "btree" ("created_at");



CREATE INDEX "idx_ai_insights_user_period" ON "public"."ai_employee_insights" USING "btree" ("user_id", "period_start", "period_end");



CREATE INDEX "idx_ai_metrics_date" ON "public"."ai_analysis_metrics" USING "btree" ("date");



CREATE INDEX "idx_ai_queue_status_priority" ON "public"."ai_analysis_queue" USING "btree" ("status", "priority");



CREATE INDEX "idx_ai_user_patterns_organization_id" ON "public"."ai_user_patterns" USING "btree" ("organization_id");



CREATE INDEX "idx_ai_user_patterns_user" ON "public"."ai_user_patterns" USING "btree" ("user_id");



CREATE INDEX "idx_app_logs_app_name" ON "public"."app_logs" USING "btree" ("app_name");



CREATE INDEX "idx_app_logs_capture_method" ON "public"."app_logs" USING "btree" ("capture_method");



CREATE INDEX "idx_app_logs_detected_at" ON "public"."app_logs" USING "btree" ("detected_at");



CREATE INDEX "idx_app_logs_organization_id" ON "public"."app_logs" USING "btree" ("organization_id");



CREATE INDEX "idx_app_logs_project_id" ON "public"."app_logs" USING "btree" ("project_id");



CREATE INDEX "idx_app_logs_time_log_id" ON "public"."app_logs" USING "btree" ("time_log_id");



CREATE INDEX "idx_app_logs_timestamp" ON "public"."app_logs" USING "btree" ("timestamp");



CREATE INDEX "idx_app_logs_user_agent_version" ON "public"."app_logs" USING "btree" ("user_id", "agent_version") WHERE ("agent_version" IS NOT NULL);



CREATE INDEX "idx_app_logs_user_id" ON "public"."app_logs" USING "btree" ("user_id");



CREATE INDEX "idx_app_url_activity_domain_lower" ON "public"."app_url_activity" USING "btree" ("lower"("domain"));



CREATE INDEX "idx_app_url_activity_open" ON "public"."app_url_activity" USING "btree" ("user_id", "started_at" DESC) WHERE ("ended_at" IS NULL);



CREATE INDEX "idx_app_url_activity_organization_id" ON "public"."app_url_activity" USING "btree" ("organization_id");



CREATE INDEX "idx_app_url_activity_recent" ON "public"."app_url_activity" USING "btree" ("user_id", "started_at" DESC);



CREATE INDEX "idx_app_url_activity_user_time" ON "public"."app_url_activity" USING "btree" ("user_id", "started_at" DESC);



CREATE INDEX "idx_employee_analysis_requests_organization_id" ON "public"."employee_analysis_requests" USING "btree" ("organization_id");



CREATE INDEX "idx_employee_analysis_requests_status" ON "public"."employee_analysis_requests" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_employee_analysis_requests_user" ON "public"."employee_analysis_requests" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_employee_behavioral_patterns_organization_id" ON "public"."employee_behavioral_patterns" USING "btree" ("organization_id");



CREATE INDEX "idx_employee_behavioral_patterns_user_date" ON "public"."employee_behavioral_patterns" USING "btree" ("user_id", "pattern_date" DESC);



CREATE INDEX "idx_employee_comprehensive_analysis_organization_id" ON "public"."employee_comprehensive_analysis" USING "btree" ("organization_id");



CREATE INDEX "idx_employee_comprehensive_analysis_productivity" ON "public"."employee_comprehensive_analysis" USING "btree" ("productivity_score" DESC);



CREATE INDEX "idx_employee_comprehensive_analysis_security_risk" ON "public"."employee_comprehensive_analysis" USING "btree" ("security_risk_level");



CREATE INDEX "idx_employee_comprehensive_analysis_user_date" ON "public"."employee_comprehensive_analysis" USING "btree" ("user_id", "analysis_date" DESC);



CREATE INDEX "idx_employee_daily_activities_organization_id" ON "public"."employee_daily_activities" USING "btree" ("organization_id");



CREATE INDEX "idx_employee_daily_activities_user_date" ON "public"."employee_daily_activities" USING "btree" ("user_id", "activity_date" DESC);



CREATE INDEX "idx_employee_deductions_organization_id" ON "public"."employee_deductions" USING "btree" ("organization_id");



CREATE INDEX "idx_employee_deductions_type" ON "public"."employee_deductions" USING "btree" ("deduction_type");



CREATE INDEX "idx_employee_deductions_user_month" ON "public"."employee_deductions" USING "btree" ("user_id", "month_year");



CREATE INDEX "idx_employee_management_insights_organization_id" ON "public"."employee_management_insights" USING "btree" ("organization_id");



CREATE INDEX "idx_employee_management_insights_user_date" ON "public"."employee_management_insights" USING "btree" ("user_id", "insight_date" DESC);



CREATE INDEX "idx_employee_project_assignments_organization_id" ON "public"."employee_project_assignments" USING "btree" ("organization_id");



CREATE INDEX "idx_employee_project_project_id" ON "public"."employee_project_assignments" USING "btree" ("project_id");



CREATE INDEX "idx_employee_project_user_id" ON "public"."employee_project_assignments" USING "btree" ("user_id");



CREATE INDEX "idx_employee_warnings_organization_id" ON "public"."employee_warnings" USING "btree" ("organization_id");



CREATE INDEX "idx_employee_warnings_reviewed" ON "public"."employee_warnings" USING "btree" ("is_reviewed");



CREATE INDEX "idx_employee_warnings_user_month" ON "public"."employee_warnings" USING "btree" ("user_id", "month_year");



CREATE INDEX "idx_employee_working_standards_organization_id" ON "public"."employee_working_standards" USING "btree" ("organization_id");



CREATE INDEX "idx_employee_working_standards_user" ON "public"."employee_working_standards" USING "btree" ("user_id");



CREATE INDEX "idx_fraud_alerts_alert_type" ON "public"."fraud_alerts" USING "btree" ("alert_type");



CREATE INDEX "idx_fraud_alerts_detected_at" ON "public"."fraud_alerts" USING "btree" ("detected_at");



CREATE INDEX "idx_fraud_alerts_false_positive" ON "public"."fraud_alerts" USING "btree" ("is_false_positive");



CREATE INDEX "idx_fraud_alerts_organization_id" ON "public"."fraud_alerts" USING "btree" ("organization_id");



CREATE INDEX "idx_fraud_alerts_reviewed" ON "public"."fraud_alerts" USING "btree" ("is_reviewed");



CREATE INDEX "idx_fraud_alerts_risk_score" ON "public"."fraud_alerts" USING "btree" ("risk_score");



CREATE INDEX "idx_fraud_alerts_severity" ON "public"."fraud_alerts" USING "btree" ("severity");



CREATE INDEX "idx_fraud_alerts_user_id" ON "public"."fraud_alerts" USING "btree" ("user_id");



CREATE INDEX "idx_idle_logs_organization_id" ON "public"."idle_logs" USING "btree" ("organization_id");



CREATE INDEX "idx_idle_logs_start_time" ON "public"."idle_logs" USING "btree" ("idle_start");



CREATE INDEX "idx_idle_logs_user_date" ON "public"."idle_logs" USING "btree" ("user_id", "idle_start");



CREATE INDEX "idx_idle_logs_user_id" ON "public"."idle_logs" USING "btree" ("user_id");



CREATE INDEX "idx_manual_hours_audit_manual_hours_id" ON "public"."manual_hours_audit" USING "btree" ("manual_hours_id");



CREATE INDEX "idx_manual_hours_date" ON "public"."manual_hours" USING "btree" ("date");



CREATE INDEX "idx_manual_hours_employee_id" ON "public"."manual_hours" USING "btree" ("employee_id");



CREATE INDEX "idx_manual_hours_organization_id" ON "public"."manual_hours" USING "btree" ("organization_id");



CREATE INDEX "idx_notification_log_created_at" ON "public"."notification_log" USING "btree" ("created_at");



CREATE INDEX "idx_notification_log_organization_id" ON "public"."notification_log" USING "btree" ("organization_id");



CREATE INDEX "idx_notification_log_queued" ON "public"."notification_log" USING "btree" ("created_at") WHERE ("status" = 'queued'::"text");



CREATE INDEX "idx_notification_log_status" ON "public"."notification_log" USING "btree" ("status");



CREATE INDEX "idx_notification_log_type" ON "public"."notification_log" USING "btree" ("notification_type");



CREATE INDEX "idx_notifications_organization_id" ON "public"."notifications" USING "btree" ("organization_id");



CREATE INDEX "idx_notifications_user_read" ON "public"."notifications" USING "btree" ("user_id", "read");



CREATE UNIQUE INDEX "idx_one_active_session_per_user_device" ON "public"."time_logs" USING "btree" ("user_id", COALESCE("device_id", 'unknown'::"text")) WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_organizations_is_active" ON "public"."organizations" USING "btree" ("is_active");



CREATE INDEX "idx_organizations_slug" ON "public"."organizations" USING "btree" ("slug");



CREATE INDEX "idx_projects_organization_id" ON "public"."projects" USING "btree" ("organization_id");



CREATE INDEX "idx_report_configurations_active" ON "public"."report_configurations" USING "btree" ("is_active");



CREATE INDEX "idx_report_configurations_organization_id" ON "public"."report_configurations" USING "btree" ("organization_id");



CREATE INDEX "idx_report_history_config" ON "public"."report_history" USING "btree" ("report_config_id");



CREATE INDEX "idx_report_history_config_date" ON "public"."report_history" USING "btree" ("report_config_id", "sent_at");



CREATE INDEX "idx_report_history_organization_id" ON "public"."report_history" USING "btree" ("organization_id");



CREATE INDEX "idx_report_history_sent_at" ON "public"."report_history" USING "btree" ("sent_at");



CREATE INDEX "idx_report_history_status" ON "public"."report_history" USING "btree" ("status");



CREATE INDEX "idx_report_recipients_config" ON "public"."report_recipients" USING "btree" ("report_config_id");



CREATE INDEX "idx_report_recipients_organization_id" ON "public"."report_recipients" USING "btree" ("organization_id");



CREATE INDEX "idx_report_types_active" ON "public"."report_types" USING "btree" ("is_active");



CREATE INDEX "idx_screenshot_comments_screenshot" ON "public"."screenshot_comments" USING "btree" ("screenshot_id");



CREATE INDEX "idx_screenshot_comments_user" ON "public"."screenshot_comments" USING "btree" ("user_id");



CREATE INDEX "idx_screenshot_deletions_deleted_at" ON "public"."screenshot_deletions" USING "btree" ("deleted_at");



CREATE INDEX "idx_screenshot_deletions_org_id" ON "public"."screenshot_deletions" USING "btree" ("organization_id");



CREATE INDEX "idx_screenshot_deletions_time_log_id" ON "public"."screenshot_deletions" USING "btree" ("time_log_id");



CREATE INDEX "idx_screenshot_deletions_user_id" ON "public"."screenshot_deletions" USING "btree" ("user_id");



CREATE INDEX "idx_screenshots_active_window_title" ON "public"."screenshots" USING "btree" ("active_window_title");



CREATE INDEX "idx_screenshots_ai_analysis_status" ON "public"."screenshots" USING "btree" ("ai_analysis_status");



CREATE INDEX "idx_screenshots_ai_analyzed_at" ON "public"."screenshots" USING "btree" ("ai_analyzed_at");



CREATE INDEX "idx_screenshots_ai_status_pending" ON "public"."screenshots" USING "btree" ("ai_analysis_status") WHERE ("ai_analysis_status" = 'pending'::"text");



CREATE INDEX "idx_screenshots_alert_id" ON "public"."screenshots" USING "btree" ("alert_id") WHERE ("alert_id" IS NOT NULL);



CREATE INDEX "idx_screenshots_app_name" ON "public"."screenshots" USING "btree" ("app_name");



CREATE INDEX "idx_screenshots_captured_at" ON "public"."screenshots" USING "btree" ("captured_at");



CREATE INDEX "idx_screenshots_category" ON "public"."screenshots" USING "btree" ("category") WHERE ("category" IS NOT NULL);



CREATE INDEX "idx_screenshots_consecutive_dup" ON "public"."screenshots" USING "btree" ("consecutive_duplicate_count") WHERE ("consecutive_duplicate_count" > 0);



CREATE INDEX "idx_screenshots_distraction_score" ON "public"."screenshots" USING "btree" ("distraction_score") WHERE ("distraction_score" IS NOT NULL);



CREATE INDEX "idx_screenshots_duplicate_hash" ON "public"."screenshots" USING "btree" ("duplicate_hash") WHERE ("duplicate_hash" IS NOT NULL);



CREATE INDEX "idx_screenshots_duplicate_matched_id" ON "public"."screenshots" USING "btree" ("duplicate_matched_id") WHERE ("duplicate_matched_id" IS NOT NULL);



CREATE INDEX "idx_screenshots_has_context" ON "public"."screenshots" USING "btree" ("has_context");



CREATE INDEX "idx_screenshots_image_sha256" ON "public"."screenshots" USING "btree" ("image_sha256");



CREATE INDEX "idx_screenshots_is_duplicate" ON "public"."screenshots" USING "btree" ("is_duplicate") WHERE ("is_duplicate" = true);



CREATE INDEX "idx_screenshots_organization_id" ON "public"."screenshots" USING "btree" ("organization_id");



CREATE INDEX "idx_screenshots_perceptual_hash" ON "public"."screenshots" USING "btree" ("perceptual_hash") WHERE ("perceptual_hash" IS NOT NULL);



CREATE INDEX "idx_screenshots_privacy_risk" ON "public"."screenshots" USING "gin" ((("ai_metadata" -> 'privacy_risk_score'::"text")));



CREATE INDEX "idx_screenshots_time_log_id" ON "public"."screenshots" USING "btree" ("time_log_id");



CREATE INDEX "idx_screenshots_timestamp" ON "public"."screenshots" USING "btree" ("timestamp");



CREATE INDEX "idx_screenshots_unanalyzed" ON "public"."screenshots" USING "btree" ("captured_at") WHERE (("ai_analysis_status" = 'pending'::"text") OR ("ai_analysis_status" IS NULL));



CREATE INDEX "idx_screenshots_url" ON "public"."screenshots" USING "btree" ("url");



CREATE INDEX "idx_screenshots_user_agent_version" ON "public"."screenshots" USING "btree" ("user_id", "agent_version") WHERE ("agent_version" IS NOT NULL);



CREATE INDEX "idx_screenshots_user_id" ON "public"."screenshots" USING "btree" ("user_id");



CREATE INDEX "idx_screenshots_user_perceptual_hash" ON "public"."screenshots" USING "btree" ("user_id", "perceptual_hash", "captured_at" DESC) WHERE ("perceptual_hash" IS NOT NULL);



CREATE INDEX "idx_screenshots_user_time" ON "public"."screenshots" USING "btree" ("user_id", "captured_at" DESC);



CREATE INDEX "idx_screenshots_window_title" ON "public"."screenshots" USING "btree" ("window_title");



CREATE INDEX "idx_screenshots_work_related" ON "public"."screenshots" USING "btree" ("is_work_related");



CREATE INDEX "idx_suspicious_activity_activity_type" ON "public"."suspicious_activity" USING "btree" ("activity_type");



CREATE INDEX "idx_suspicious_activity_category" ON "public"."suspicious_activity" USING "btree" ("category");



CREATE INDEX "idx_suspicious_activity_organization_id" ON "public"."suspicious_activity" USING "btree" ("organization_id");



CREATE INDEX "idx_suspicious_activity_reviewed" ON "public"."suspicious_activity" USING "btree" ("reviewed");



CREATE INDEX "idx_suspicious_activity_risk_score" ON "public"."suspicious_activity" USING "btree" ("risk_score");



CREATE INDEX "idx_suspicious_activity_timestamp" ON "public"."suspicious_activity" USING "btree" ("timestamp");



CREATE INDEX "idx_suspicious_activity_user_id" ON "public"."suspicious_activity" USING "btree" ("user_id");



CREATE INDEX "idx_system_checks_status" ON "public"."system_checks" USING "btree" ("status");



CREATE INDEX "idx_system_checks_timestamp" ON "public"."system_checks" USING "btree" ("timestamp");



CREATE INDEX "idx_system_checks_type" ON "public"."system_checks" USING "btree" ("check_type");



CREATE INDEX "idx_system_logs_type_created" ON "public"."system_logs" USING "btree" ("log_type", "created_at");



CREATE INDEX "idx_tasks_organization_id" ON "public"."tasks" USING "btree" ("organization_id");



CREATE INDEX "idx_time_logs_device_id" ON "public"."time_logs" USING "btree" ("device_id") WHERE ("device_id" IS NOT NULL);



CREATE INDEX "idx_time_logs_idle" ON "public"."time_logs" USING "btree" ("is_idle");



CREATE INDEX "idx_time_logs_organization_id" ON "public"."time_logs" USING "btree" ("organization_id");



CREATE INDEX "idx_time_logs_project_id" ON "public"."time_logs" USING "btree" ("project_id");



CREATE INDEX "idx_time_logs_start_time" ON "public"."time_logs" USING "btree" ("start_time");



CREATE INDEX "idx_time_logs_user_id" ON "public"."time_logs" USING "btree" ("user_id");



CREATE INDEX "idx_tla_employee_id" ON "public"."team_leader_assignments" USING "btree" ("employee_id");



CREATE INDEX "idx_tla_team_leader_id" ON "public"."team_leader_assignments" USING "btree" ("team_leader_id");



CREATE INDEX "idx_url_logs_domain" ON "public"."url_logs_old" USING "btree" ("domain");



CREATE INDEX "idx_url_logs_time_log_id" ON "public"."url_logs_old" USING "btree" ("time_log_id");



CREATE INDEX "idx_url_logs_user_id" ON "public"."url_logs_old" USING "btree" ("user_id");



CREATE INDEX "idx_url_logs_user_timestamp" ON "public"."url_logs_old" USING "btree" ("user_id", "timestamp");



CREATE INDEX "idx_user_invites_email" ON "public"."user_invites" USING "btree" ("email");



CREATE INDEX "idx_user_invites_invited_by" ON "public"."user_invites" USING "btree" ("invited_by");



CREATE INDEX "idx_user_invites_organization_id" ON "public"."user_invites" USING "btree" ("organization_id");



CREATE INDEX "idx_user_invites_token" ON "public"."user_invites" USING "btree" ("invite_token");



CREATE INDEX "idx_users_email" ON "public"."users" USING "btree" ("email");



CREATE INDEX "idx_users_id" ON "public"."users" USING "btree" ("id");



CREATE INDEX "idx_users_is_active" ON "public"."users" USING "btree" ("is_active");



CREATE INDEX "idx_users_is_org_admin" ON "public"."users" USING "btree" ("is_org_admin");



CREATE INDEX "idx_users_is_super_admin" ON "public"."users" USING "btree" ("is_super_admin");



CREATE INDEX "idx_users_organization_id" ON "public"."users" USING "btree" ("organization_id");



CREATE INDEX "idx_users_role_active" ON "public"."users" USING "btree" ("role", "is_active");



CREATE INDEX "idx_vision_analysis_metrics_created_at" ON "public"."vision_analysis_metrics" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_warning_logs_message_id" ON "public"."warning_logs" USING "btree" ("warning_message_id");



CREATE INDEX "idx_warning_logs_organization_id" ON "public"."warning_logs" USING "btree" ("organization_id");



CREATE INDEX "idx_warning_logs_shown_at" ON "public"."warning_logs" USING "btree" ("shown_at");



CREATE INDEX "idx_warning_logs_user_id" ON "public"."warning_logs" USING "btree" ("user_id");



CREATE INDEX "idx_warning_messages_active" ON "public"."warning_messages" USING "btree" ("is_active");



CREATE INDEX "idx_warning_messages_organization_id" ON "public"."warning_messages" USING "btree" ("organization_id");



CREATE INDEX "idx_warning_messages_target" ON "public"."warning_messages" USING "btree" ("target_audience");



CREATE INDEX "idx_warning_messages_valid_period" ON "public"."warning_messages" USING "btree" ("valid_from", "valid_until");



CREATE INDEX "idx_warning_templates_category" ON "public"."warning_templates" USING "btree" ("category");



CREATE INDEX "idx_worker_status_type" ON "public"."worker_status" USING "btree" ("worker_type");



CREATE UNIQUE INDEX "uq_app_url_activity_dedupe" ON "public"."app_url_activity" USING "btree" ("user_id", "site_url", "started_at") WHERE ("site_url" IS NOT NULL);



CREATE OR REPLACE TRIGGER "app_settings_updated_at" BEFORE UPDATE ON "public"."app_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_app_settings_timestamp"();



CREATE OR REPLACE TRIGGER "employee_status_change_notification" AFTER UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."notify_employee_status_change"();



CREATE OR REPLACE TRIGGER "fraud_alert_notification_trigger" AFTER INSERT ON "public"."fraud_alerts" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_fraud_alert_notification"();



CREATE OR REPLACE TRIGGER "new_employee_welcome_notification" AFTER INSERT ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."notify_new_employee_welcome"();



CREATE OR REPLACE TRIGGER "set_app_logs_org_id" BEFORE INSERT ON "public"."app_logs" FOR EACH ROW EXECUTE FUNCTION "public"."set_organization_id"();



CREATE OR REPLACE TRIGGER "set_idle_logs_org_id" BEFORE INSERT ON "public"."idle_logs" FOR EACH ROW EXECUTE FUNCTION "public"."set_organization_id"();



CREATE OR REPLACE TRIGGER "set_manual_hours_updated_at" BEFORE UPDATE ON "public"."manual_hours" FOR EACH ROW EXECUTE FUNCTION "public"."update_manual_hours_updated_at"();



CREATE OR REPLACE TRIGGER "set_screenshots_org_id" BEFORE INSERT ON "public"."screenshots" FOR EACH ROW EXECUTE FUNCTION "public"."set_organization_id"();



CREATE OR REPLACE TRIGGER "set_time_logs_org_id" BEFORE INSERT ON "public"."time_logs" FOR EACH ROW EXECUTE FUNCTION "public"."set_organization_id"();



CREATE OR REPLACE TRIGGER "sync_screenshot_timestamps_trigger" BEFORE INSERT OR UPDATE ON "public"."screenshots" FOR EACH ROW EXECUTE FUNCTION "public"."sync_screenshot_timestamps"();



COMMENT ON TRIGGER "sync_screenshot_timestamps_trigger" ON "public"."screenshots" IS 'Keeps timestamp and captured_at columns synchronized. App code uses captured_at while original schema used timestamp.';



CREATE OR REPLACE TRIGGER "trg_url_logs_ud" INSTEAD OF DELETE OR UPDATE ON "public"."url_logs" FOR EACH ROW EXECUTE FUNCTION "public"."url_logs_view_ud_block"();



CREATE OR REPLACE TRIGGER "trg_url_logs_view_insert" INSTEAD OF INSERT ON "public"."url_logs" FOR EACH ROW EXECUTE FUNCTION "public"."url_logs_view_insert"();



CREATE OR REPLACE TRIGGER "trigger_update_ai_metrics" AFTER UPDATE ON "public"."ai_analysis_queue" FOR EACH ROW EXECUTE FUNCTION "public"."update_ai_analysis_metrics"();



CREATE OR REPLACE TRIGGER "trigger_update_consecutive_dup" BEFORE INSERT OR UPDATE OF "is_duplicate" ON "public"."screenshots" FOR EACH ROW EXECUTE FUNCTION "public"."update_consecutive_duplicate_count"();



CREATE OR REPLACE TRIGGER "update_employee_deductions_updated_at" BEFORE UPDATE ON "public"."employee_deductions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_employee_warnings_updated_at" BEFORE UPDATE ON "public"."employee_warnings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_employee_working_standards_updated_at" BEFORE UPDATE ON "public"."employee_working_standards" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_fraud_alerts_updated_at" BEFORE UPDATE ON "public"."fraud_alerts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_notification_log_updated_at" BEFORE UPDATE ON "public"."notification_log" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_notifications_updated_at" BEFORE UPDATE ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_report_configurations_updated_at" BEFORE UPDATE ON "public"."report_configurations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_report_types_updated_at" BEFORE UPDATE ON "public"."report_types" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_warning_messages_updated_at" BEFORE UPDATE ON "public"."warning_messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_warning_templates_updated_at" BEFORE UPDATE ON "public"."warning_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_user_id_fkey" FOREIGN KEY ("user_id");



ALTER TABLE ONLY "public"."admin_alerts"
    ADD CONSTRAINT "admin_alerts_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."admin_alerts"
    ADD CONSTRAINT "admin_alerts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."admin_alerts"
    ADD CONSTRAINT "admin_alerts_screenshot_id_fkey" FOREIGN KEY ("screenshot_id") REFERENCES "public"."screenshots"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_alerts"
    ADD CONSTRAINT "admin_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_employee_insights"
    ADD CONSTRAINT "ai_employee_insights_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."ai_employee_insights"
    ADD CONSTRAINT "ai_employee_insights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_user_patterns"
    ADD CONSTRAINT "ai_user_patterns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."ai_user_patterns"
    ADD CONSTRAINT "ai_user_patterns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_logs"
    ADD CONSTRAINT "app_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."app_logs"
    ADD CONSTRAINT "app_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."app_logs"
    ADD CONSTRAINT "app_logs_time_log_id_fkey" FOREIGN KEY ("time_log_id") REFERENCES "public"."time_logs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_logs"
    ADD CONSTRAINT "app_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_analysis_requests"
    ADD CONSTRAINT "employee_analysis_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."employee_analysis_requests"
    ADD CONSTRAINT "employee_analysis_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."employee_analysis_requests"
    ADD CONSTRAINT "employee_analysis_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_behavioral_patterns"
    ADD CONSTRAINT "employee_behavioral_patterns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."employee_behavioral_patterns"
    ADD CONSTRAINT "employee_behavioral_patterns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_comprehensive_analysis"
    ADD CONSTRAINT "employee_comprehensive_analysis_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."employee_comprehensive_analysis"
    ADD CONSTRAINT "employee_comprehensive_analysis_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_daily_activities"
    ADD CONSTRAINT "employee_daily_activities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."employee_daily_activities"
    ADD CONSTRAINT "employee_daily_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_deductions"
    ADD CONSTRAINT "employee_deductions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."employee_deductions"
    ADD CONSTRAINT "employee_deductions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."employee_deductions"
    ADD CONSTRAINT "employee_deductions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_management_insights"
    ADD CONSTRAINT "employee_management_insights_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."employee_management_insights"
    ADD CONSTRAINT "employee_management_insights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_project_assignments"
    ADD CONSTRAINT "employee_project_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."employee_project_assignments"
    ADD CONSTRAINT "employee_project_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."employee_project_assignments"
    ADD CONSTRAINT "employee_project_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_project_assignments"
    ADD CONSTRAINT "employee_project_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_warnings"
    ADD CONSTRAINT "employee_warnings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."employee_warnings"
    ADD CONSTRAINT "employee_warnings_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."employee_warnings"
    ADD CONSTRAINT "employee_warnings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_working_standards"
    ADD CONSTRAINT "employee_working_standards_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."employee_working_standards"
    ADD CONSTRAINT "employee_working_standards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fraud_alerts"
    ADD CONSTRAINT "fraud_alerts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."fraud_alerts"
    ADD CONSTRAINT "fraud_alerts_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."fraud_alerts"
    ADD CONSTRAINT "fraud_alerts_time_log_id_fkey" FOREIGN KEY ("time_log_id") REFERENCES "public"."time_logs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fraud_alerts"
    ADD CONSTRAINT "fraud_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."idle_logs"
    ADD CONSTRAINT "idle_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."idle_logs"
    ADD CONSTRAINT "idle_logs_time_log_id_fkey" FOREIGN KEY ("time_log_id") REFERENCES "public"."time_logs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."idle_logs"
    ADD CONSTRAINT "idle_logs_user_id_fkey" FOREIGN KEY ("user_id");



ALTER TABLE ONLY "public"."manual_hours_audit"
    ADD CONSTRAINT "manual_hours_audit_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."manual_hours_audit"
    ADD CONSTRAINT "manual_hours_audit_manual_hours_id_fkey" FOREIGN KEY ("manual_hours_id") REFERENCES "public"."manual_hours"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."manual_hours"
    ADD CONSTRAINT "manual_hours_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."manual_hours"
    ADD CONSTRAINT "manual_hours_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."manual_hours"
    ADD CONSTRAINT "manual_hours_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_log"
    ADD CONSTRAINT "notification_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."notification_log"
    ADD CONSTRAINT "notification_log_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."report_configurations"
    ADD CONSTRAINT "report_configurations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."report_configurations"
    ADD CONSTRAINT "report_configurations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."report_configurations"
    ADD CONSTRAINT "report_configurations_report_type_id_fkey" FOREIGN KEY ("report_type_id") REFERENCES "public"."report_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_history"
    ADD CONSTRAINT "report_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."report_history"
    ADD CONSTRAINT "report_history_report_config_id_fkey" FOREIGN KEY ("report_config_id") REFERENCES "public"."report_configurations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_recipients"
    ADD CONSTRAINT "report_recipients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."report_recipients"
    ADD CONSTRAINT "report_recipients_report_config_id_fkey" FOREIGN KEY ("report_config_id") REFERENCES "public"."report_configurations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_recipients"
    ADD CONSTRAINT "report_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."screenshot_comments"
    ADD CONSTRAINT "screenshot_comments_screenshot_id_fkey" FOREIGN KEY ("screenshot_id") REFERENCES "public"."screenshots"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."screenshot_comments"
    ADD CONSTRAINT "screenshot_comments_user_id_fkey" FOREIGN KEY ("user_id");



ALTER TABLE ONLY "public"."screenshot_deletions"
    ADD CONSTRAINT "screenshot_deletions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."screenshot_deletions"
    ADD CONSTRAINT "screenshot_deletions_time_log_id_fkey" FOREIGN KEY ("time_log_id") REFERENCES "public"."time_logs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."screenshot_deletions"
    ADD CONSTRAINT "screenshot_deletions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."screenshots"
    ADD CONSTRAINT "screenshots_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "public"."admin_alerts"("id");



ALTER TABLE ONLY "public"."screenshots"
    ADD CONSTRAINT "screenshots_duplicate_matched_id_fkey" FOREIGN KEY ("duplicate_matched_id") REFERENCES "public"."screenshots"("id");



ALTER TABLE ONLY "public"."screenshots"
    ADD CONSTRAINT "screenshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."screenshots"
    ADD CONSTRAINT "screenshots_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."screenshots"
    ADD CONSTRAINT "screenshots_time_log_id_fkey" FOREIGN KEY ("time_log_id") REFERENCES "public"."time_logs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."screenshots"
    ADD CONSTRAINT "screenshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."suspicious_activity"
    ADD CONSTRAINT "suspicious_activity_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."suspicious_activity"
    ADD CONSTRAINT "suspicious_activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_leader_assignments"
    ADD CONSTRAINT "team_leader_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."team_leader_assignments"
    ADD CONSTRAINT "team_leader_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_leader_assignments"
    ADD CONSTRAINT "team_leader_assignments_team_leader_id_fkey" FOREIGN KEY ("team_leader_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."time_logs"
    ADD CONSTRAINT "time_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."time_logs"
    ADD CONSTRAINT "time_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."time_logs"
    ADD CONSTRAINT "time_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."time_logs"
    ADD CONSTRAINT "time_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."url_logs_old"
    ADD CONSTRAINT "url_logs_time_log_id_fkey" FOREIGN KEY ("time_log_id") REFERENCES "public"."time_logs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."url_logs_old"
    ADD CONSTRAINT "url_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_invites"
    ADD CONSTRAINT "user_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."user_invites"
    ADD CONSTRAINT "user_invites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."user_invites"
    ADD CONSTRAINT "user_invites_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_paused_by_fkey" FOREIGN KEY ("paused_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."vision_feature_flags"
    ADD CONSTRAINT "vision_feature_flags_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."warning_logs"
    ADD CONSTRAINT "warning_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."warning_logs"
    ADD CONSTRAINT "warning_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warning_logs"
    ADD CONSTRAINT "warning_logs_warning_message_id_fkey" FOREIGN KEY ("warning_message_id") REFERENCES "public"."warning_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warning_messages"
    ADD CONSTRAINT "warning_messages_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."warning_messages"
    ADD CONSTRAINT "warning_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



CREATE POLICY "Admin can view all insights" ON "public"."ai_employee_insights" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admin can view analysis queue" ON "public"."ai_analysis_queue" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admin can view metrics" ON "public"."ai_analysis_metrics" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admin can view vision analysis metrics" ON "public"."vision_analysis_metrics" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"text")))));



CREATE POLICY "Admin can view vision feature flags" ON "public"."vision_feature_flags" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"text")))));



CREATE POLICY "Admin can view worker status" ON "public"."worker_status" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can create organization invites" ON "public"."user_invites" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"text") AND (("u"."is_super_admin" = true) OR ("u"."organization_id" IS NULL) OR ("u"."organization_id" = "u"."organization_id"))))));



CREATE POLICY "Admins can delete assignments" ON "public"."employee_project_assignments" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can delete organization invites" ON "public"."user_invites" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"text") AND (("u"."is_super_admin" = true) OR ("user_invites"."organization_id" IS NULL) OR ("u"."organization_id" = "user_invites"."organization_id"))))));



CREATE POLICY "Admins can insert assignments" ON "public"."employee_project_assignments" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can insert settings" ON "public"."app_settings" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage all app logs" ON "public"."app_logs" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "Admins can manage all deductions" ON "public"."employee_deductions" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "Admins can manage all fraud alerts" ON "public"."fraud_alerts" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "Admins can manage all notifications" ON "public"."notifications" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "Admins can manage all report configurations" ON "public"."report_configurations" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "Admins can manage all report recipients" ON "public"."report_recipients" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "Admins can manage all report types" ON "public"."report_types" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "Admins can manage all screenshots" ON "public"."screenshots" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "Admins can manage all team assignments" ON "public"."team_leader_assignments" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage all time logs" ON "public"."time_logs" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "Admins can manage all warning messages" ON "public"."warning_messages" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "Admins can manage all warnings" ON "public"."employee_warnings" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "Admins can manage notification log" ON "public"."notification_log" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "Admins can manage warning templates" ON "public"."warning_templates" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "Admins can manage working standards" ON "public"."employee_working_standards" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "Admins can read settings" ON "public"."app_settings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update assignments" ON "public"."employee_project_assignments" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update organization invites" ON "public"."user_invites" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"text") AND (("u"."is_super_admin" = true) OR ("user_invites"."organization_id" IS NULL) OR ("u"."organization_id" = "user_invites"."organization_id"))))));



CREATE POLICY "Admins can update settings" ON "public"."app_settings" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can view all URL logs" ON "public"."url_logs_old" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "Admins can view all analysis requests" ON "public"."employee_analysis_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can view all app logs" ON "public"."app_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "Admins can view all assignments" ON "public"."employee_project_assignments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can view all behavioral patterns" ON "public"."employee_behavioral_patterns" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can view all daily activities" ON "public"."employee_daily_activities" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can view all employee analysis data" ON "public"."employee_comprehensive_analysis" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can view all idle logs" ON "public"."idle_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "Admins can view all management insights" ON "public"."employee_management_insights" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can view all report history" ON "public"."report_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "Admins can view all screenshots" ON "public"."screenshots" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "Admins can view all suspicious activity" ON "public"."suspicious_activity" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "Admins can view all time logs" ON "public"."time_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "Admins can view all warning logs" ON "public"."warning_logs" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "Admins can view organization invites" ON "public"."user_invites" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"text") AND (("u"."is_super_admin" = true) OR ("user_invites"."organization_id" IS NULL) OR ("u"."organization_id" = "user_invites"."organization_id"))))));



CREATE POLICY "Admins can view patterns" ON "public"."ai_user_patterns" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "All users can view warning templates" ON "public"."warning_templates" FOR SELECT USING (true);



CREATE POLICY "Allow all app_logs operations for troubleshooting" ON "public"."app_logs" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all idle_logs operations" ON "public"."idle_logs" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all operations on screenshots" ON "public"."screenshots" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all screenshot operations" ON "public"."screenshots" USING (true) WITH CHECK (true);



COMMENT ON POLICY "Allow all screenshot operations" ON "public"."screenshots" IS 'Temporary permissive policy to fix desktop agent upload issues - should be refined with proper user authentication later';



CREATE POLICY "Allow all url_logs operations for troubleshooting" ON "public"."url_logs_old" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated activity logging" ON "public"."app_logs" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow authenticated idle logging" ON "public"."idle_logs" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow screenshot inserts for testing" ON "public"."screenshots" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Anyone can read comments" ON "public"."screenshot_comments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Desktop agent can manage app logs" ON "public"."app_logs" USING (true) WITH CHECK (true);



COMMENT ON POLICY "Desktop agent can manage app logs" ON "public"."app_logs" IS 'Temporary permissive policy for desktop agent - allows all operations until proper authentication is implemented';



CREATE POLICY "Desktop agent can manage idle logs" ON "public"."idle_logs" USING (true) WITH CHECK (true);



CREATE POLICY "Desktop agent can manage screenshots" ON "public"."screenshots" USING (true) WITH CHECK (true);



COMMENT ON POLICY "Desktop agent can manage screenshots" ON "public"."screenshots" IS 'Temporary permissive policy for desktop agent - allows all operations until proper authentication is implemented';



CREATE POLICY "Desktop agent can manage time logs" ON "public"."time_logs" USING (true) WITH CHECK (true);



COMMENT ON POLICY "Desktop agent can manage time logs" ON "public"."time_logs" IS 'Temporary permissive policy for desktop agent - allows all operations until proper authentication is implemented';



CREATE POLICY "Desktop agent can manage url logs" ON "public"."url_logs_old" USING (true) WITH CHECK (true);



COMMENT ON POLICY "Desktop agent can manage url logs" ON "public"."url_logs_old" IS 'Temporary permissive policy for desktop agent - allows all operations until proper authentication is implemented';



CREATE POLICY "Employees can view own assignments" ON "public"."employee_project_assignments" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Employees can view own deductions" ON "public"."employee_deductions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Employees can view own fraud alerts" ON "public"."fraud_alerts" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Employees can view own standards" ON "public"."employee_working_standards" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Employees can view own warnings" ON "public"."employee_warnings" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Employees can view warnings targeted to them" ON "public"."warning_messages" FOR SELECT USING ((("is_active" = true) AND (("valid_from" IS NULL) OR ("valid_from" <= "now"())) AND (("valid_until" IS NULL) OR ("valid_until" >= "now"())) AND (("target_audience" = 'all'::"text") OR (("target_audience" = 'employee'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'employee'::"text"))))) OR (("target_audience" = 'specific'::"text") AND ("auth"."uid"() = ANY ("target_user_ids"))))));



CREATE POLICY "Managers can view team analysis data" ON "public"."employee_comprehensive_analysis" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "Managers can view team management insights" ON "public"."employee_management_insights" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "Service role can insert analysis data" ON "public"."employee_comprehensive_analysis" FOR INSERT WITH CHECK (true);



CREATE POLICY "Service role can insert analysis requests" ON "public"."employee_analysis_requests" FOR INSERT WITH CHECK (true);



CREATE POLICY "Service role can insert behavioral patterns" ON "public"."employee_behavioral_patterns" FOR INSERT WITH CHECK (true);



CREATE POLICY "Service role can insert daily activities" ON "public"."employee_daily_activities" FOR INSERT WITH CHECK (true);



CREATE POLICY "Service role can insert fraud alerts" ON "public"."fraud_alerts" FOR INSERT WITH CHECK (true);



CREATE POLICY "Service role can insert management insights" ON "public"."employee_management_insights" FOR INSERT WITH CHECK (true);



CREATE POLICY "Service role can insert report history" ON "public"."report_history" FOR INSERT WITH CHECK (true);



CREATE POLICY "Service role can manage activities" ON "public"."activities" USING (true);



CREATE POLICY "Service role can manage analysis queue" ON "public"."ai_analysis_queue" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage app logs" ON "public"."app_logs" USING (("auth"."role"() = 'service_role'::"text"));



COMMENT ON POLICY "Service role can manage app logs" ON "public"."app_logs" IS 'Allows desktop agent to insert app logs using service role';



CREATE POLICY "Service role can manage idle logs" ON "public"."idle_logs" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage insights" ON "public"."ai_employee_insights" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage metrics" ON "public"."ai_analysis_metrics" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage patterns" ON "public"."ai_user_patterns" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage screenshots" ON "public"."screenshots" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage time logs" ON "public"."time_logs" USING (("auth"."role"() = 'service_role'::"text"));



COMMENT ON POLICY "Service role can manage time logs" ON "public"."time_logs" IS 'Allows desktop agent to insert time logs using service role';



CREATE POLICY "Service role can manage url logs" ON "public"."url_logs_old" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage vision analysis metrics" ON "public"."vision_analysis_metrics" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage vision feature flags" ON "public"."vision_feature_flags" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage worker status" ON "public"."worker_status" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can update analysis data" ON "public"."employee_comprehensive_analysis" FOR UPDATE USING (true);



CREATE POLICY "Service role can update analysis requests" ON "public"."employee_analysis_requests" FOR UPDATE USING (true);



CREATE POLICY "Service role can update screenshots" ON "public"."screenshots" FOR UPDATE USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access to screenshot_deletions" ON "public"."screenshot_deletions" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "System can update system checks" ON "public"."system_checks" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Team leaders can view their own assignments" ON "public"."team_leader_assignments" FOR SELECT TO "authenticated" USING ((("team_leader_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'team_leader'::"text"))))));



CREATE POLICY "Users can add comments" ON "public"."screenshot_comments" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own comments" ON "public"."screenshot_comments" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own activities" ON "public"."activities" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR "public"."is_super_admin"("auth"."uid"())));



CREATE POLICY "Users can insert own idle logs" ON "public"."idle_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert system checks" ON "public"."system_checks" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Users can insert their own deletions" ON "public"."screenshot_deletions" FOR INSERT WITH CHECK (("auth"."uid"() = "deleted_by"));



CREATE POLICY "Users can insert their own warning logs" ON "public"."warning_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read system checks" ON "public"."system_checks" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Users can update own comments" ON "public"."screenshot_comments" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own screenshots" ON "public"."screenshots" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own warning logs" ON "public"."warning_logs" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own activities" ON "public"."activities" FOR SELECT USING ((("auth"."uid"() = "user_id") OR "public"."is_super_admin"("auth"."uid"()) OR ("organization_id" = "public"."get_user_organization_id"("auth"."uid"()))));



CREATE POLICY "Users can view own analysis data" ON "public"."employee_comprehensive_analysis" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own analysis requests" ON "public"."employee_analysis_requests" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR ("requested_by" = "auth"."uid"())));



CREATE POLICY "Users can view own behavioral patterns" ON "public"."employee_behavioral_patterns" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own daily activities" ON "public"."employee_daily_activities" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own idle logs" ON "public"."idle_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own insights" ON "public"."ai_employee_insights" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own deletions" ON "public"."screenshot_deletions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own suspicious activity" ON "public"."suspicious_activity" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own warning logs" ON "public"."warning_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_alerts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_alerts_select_policy" ON "public"."admin_alerts" FOR SELECT USING (("public"."is_super_admin"() OR ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))) AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL))) OR (("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")));



CREATE POLICY "admin_alerts_service_role_policy" ON "public"."admin_alerts" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "admin_alerts_update_policy" ON "public"."admin_alerts" FOR UPDATE USING (("public"."is_super_admin"() OR ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))))) AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL))) OR (("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")));



CREATE POLICY "admins_insert_manual_hours_audit" ON "public"."manual_hours_audit" FOR INSERT WITH CHECK (("changed_by" = "auth"."uid"()));



CREATE POLICY "admins_manage_manual_hours" ON "public"."manual_hours" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text") AND (("users"."organization_id" = "manual_hours"."organization_id") OR ("users"."organization_id" IS NULL))))));



CREATE POLICY "admins_view_manual_hours_audit" ON "public"."manual_hours_audit" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



ALTER TABLE "public"."ai_analysis_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_analysis_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_employee_insights" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_user_patterns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_logs_insert_policy" ON "public"."app_logs" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "app_logs_select_policy" ON "public"."app_logs" FOR SELECT USING (("public"."is_super_admin"() OR (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL)) OR ("user_id" = "auth"."uid"())));



ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_url_activity" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "desktop_agent_uploads" ON "public"."screenshots" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."employee_analysis_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employee_analysis_requests_insert_policy" ON "public"."employee_analysis_requests" FOR INSERT WITH CHECK (("public"."is_super_admin"("auth"."uid"()) OR ("organization_id" = "public"."get_user_organization_id"("auth"."uid"()))));



CREATE POLICY "employee_analysis_requests_select_policy" ON "public"."employee_analysis_requests" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "requested_by") OR "public"."is_super_admin"("auth"."uid"()) OR ("organization_id" = "public"."get_user_organization_id"("auth"."uid"()))));



ALTER TABLE "public"."employee_behavioral_patterns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employee_behavioral_patterns_insert_policy" ON "public"."employee_behavioral_patterns" FOR INSERT WITH CHECK (("public"."is_super_admin"("auth"."uid"()) OR ("organization_id" = "public"."get_user_organization_id"("auth"."uid"()))));



CREATE POLICY "employee_behavioral_patterns_select_policy" ON "public"."employee_behavioral_patterns" FOR SELECT USING ((("auth"."uid"() = "user_id") OR "public"."is_super_admin"("auth"."uid"()) OR ("organization_id" = "public"."get_user_organization_id"("auth"."uid"()))));



ALTER TABLE "public"."employee_comprehensive_analysis" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_daily_activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_deductions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_management_insights" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_project_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_warnings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_working_standards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employees_view_own_manual_hours" ON "public"."manual_hours" FOR SELECT USING (("employee_id" = "auth"."uid"()));



ALTER TABLE "public"."fraud_alerts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "idle_logs_insert_policy" ON "public"."idle_logs" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "idle_logs_select_policy" ON "public"."idle_logs" FOR SELECT USING (("public"."is_super_admin"() OR (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL)) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "insert_own_url_activity" ON "public"."app_url_activity" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."manual_hours" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."manual_hours_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_log_insert_policy" ON "public"."notification_log" FOR INSERT WITH CHECK (("public"."is_super_admin"("auth"."uid"()) OR ("organization_id" = "public"."get_user_organization_id"("auth"."uid"()))));



CREATE POLICY "notification_log_select_policy" ON "public"."notification_log" FOR SELECT USING (("public"."is_super_admin"("auth"."uid"()) OR ("organization_id" = "public"."get_user_organization_id"("auth"."uid"())) OR ("recipient_id" = "auth"."uid"())));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organizations_delete_policy" ON "public"."organizations" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."get_current_user_context"() "ctx"("user_id", "organization_id", "role", "is_org_admin", "is_super_admin")
  WHERE ("ctx"."is_super_admin" = true))));



CREATE POLICY "organizations_insert_policy" ON "public"."organizations" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."get_current_user_context"() "ctx"("user_id", "organization_id", "role", "is_org_admin", "is_super_admin")
  WHERE ("ctx"."is_super_admin" = true))));



CREATE POLICY "organizations_select_policy" ON "public"."organizations" FOR SELECT TO "authenticated", "anon" USING (((("auth"."role"() = 'anon'::"text") AND ("is_active" = true)) OR (EXISTS ( SELECT 1
   FROM "public"."get_current_user_context"() "ctx"("user_id", "organization_id", "role", "is_org_admin", "is_super_admin")
  WHERE (("ctx"."is_super_admin" = true) OR (("ctx"."organization_id" IS NOT NULL) AND ("ctx"."organization_id" = "organizations"."id")))))));



CREATE POLICY "organizations_update_policy" ON "public"."organizations" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."get_current_user_context"() "ctx"("user_id", "organization_id", "role", "is_org_admin", "is_super_admin")
  WHERE ("ctx"."is_super_admin" = true)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."get_current_user_context"() "ctx"("user_id", "organization_id", "role", "is_org_admin", "is_super_admin")
  WHERE ("ctx"."is_super_admin" = true))));



CREATE POLICY "projects_delete_policy" ON "public"."projects" FOR DELETE USING (("public"."is_super_admin"() OR (("public"."is_org_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text"))))) AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL)))));



CREATE POLICY "projects_insert_policy" ON "public"."projects" FOR INSERT WITH CHECK (("public"."is_super_admin"() OR "public"."is_org_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"])))))));



CREATE POLICY "projects_select_policy" ON "public"."projects" FOR SELECT USING (("public"."is_super_admin"() OR (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL))));



CREATE POLICY "projects_update_policy" ON "public"."projects" FOR UPDATE USING (("public"."is_super_admin"() OR (("public"."is_org_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"])))))) AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL)))));



ALTER TABLE "public"."report_configurations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."report_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."report_recipients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."report_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."screenshot_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."screenshot_deletions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "screenshots_insert_policy" ON "public"."screenshots" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "screenshots_policy" ON "public"."screenshots" USING ((("public"."get_user_role"("auth"."uid"()) = ANY (ARRAY['admin'::"text", 'manager'::"text"])) OR ("user_id" = "auth"."uid"()))) WITH CHECK ((("public"."get_user_role"("auth"."uid"()) = ANY (ARRAY['admin'::"text", 'manager'::"text"])) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "screenshots_select_policy" ON "public"."screenshots" FOR SELECT USING (("public"."is_super_admin"() OR (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL)) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "select_own_url_activity" ON "public"."app_url_activity" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."suspicious_activity" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_checks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tasks_insert_policy" ON "public"."tasks" FOR INSERT WITH CHECK (("public"."is_super_admin"() OR "public"."is_org_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"])))))));



CREATE POLICY "tasks_policy" ON "public"."tasks" USING ((("public"."get_user_role"("auth"."uid"()) = ANY (ARRAY['admin'::"text", 'manager'::"text"])) OR ("created_by" = "auth"."uid"()))) WITH CHECK ((("public"."get_user_role"("auth"."uid"()) = ANY (ARRAY['admin'::"text", 'manager'::"text"])) OR ("created_by" = "auth"."uid"())));



CREATE POLICY "tasks_select_policy" ON "public"."tasks" FOR SELECT USING (("public"."is_super_admin"() OR (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL))));



CREATE POLICY "tasks_update_policy" ON "public"."tasks" FOR UPDATE USING (("public"."is_super_admin"() OR (("public"."is_org_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"])))))) AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL)))));



CREATE POLICY "team_leader_app_logs_select" ON "public"."app_logs" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'team_leader'::"text") AND ("users"."is_active" = true)))) AND (EXISTS ( SELECT 1
   FROM "public"."team_leader_assignments"
  WHERE (("team_leader_assignments"."team_leader_id" = "auth"."uid"()) AND ("team_leader_assignments"."employee_id" = "app_logs"."user_id"))))));



ALTER TABLE "public"."team_leader_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "team_leader_idle_logs_select" ON "public"."idle_logs" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'team_leader'::"text") AND ("users"."is_active" = true)))) AND (EXISTS ( SELECT 1
   FROM "public"."team_leader_assignments"
  WHERE (("team_leader_assignments"."team_leader_id" = "auth"."uid"()) AND ("team_leader_assignments"."employee_id" = "idle_logs"."user_id"))))));



CREATE POLICY "team_leader_screenshots_select" ON "public"."screenshots" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'team_leader'::"text") AND ("users"."is_active" = true)))) AND (EXISTS ( SELECT 1
   FROM "public"."team_leader_assignments"
  WHERE (("team_leader_assignments"."team_leader_id" = "auth"."uid"()) AND ("team_leader_assignments"."employee_id" = "screenshots"."user_id"))))));



CREATE POLICY "team_leader_time_logs_select" ON "public"."time_logs" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'team_leader'::"text") AND ("users"."is_active" = true)))) AND (EXISTS ( SELECT 1
   FROM "public"."team_leader_assignments"
  WHERE (("team_leader_assignments"."team_leader_id" = "auth"."uid"()) AND ("team_leader_assignments"."employee_id" = "time_logs"."user_id"))))));



ALTER TABLE "public"."time_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "time_logs_insert_policy" ON "public"."time_logs" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "time_logs_policy" ON "public"."time_logs" USING ((("public"."get_user_role"("auth"."uid"()) = ANY (ARRAY['admin'::"text", 'manager'::"text"])) OR ("user_id" = "auth"."uid"()))) WITH CHECK ((("public"."get_user_role"("auth"."uid"()) = ANY (ARRAY['admin'::"text", 'manager'::"text"])) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "time_logs_select_policy" ON "public"."time_logs" FOR SELECT USING (("public"."is_super_admin"() OR (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL)) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "time_logs_update_policy" ON "public"."time_logs" FOR UPDATE USING ((("user_id" = "auth"."uid"()) OR "public"."is_super_admin"() OR ("public"."is_org_admin"() AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL)))));



ALTER TABLE "public"."user_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_insert_policy" ON "public"."users" FOR INSERT WITH CHECK ((("id" = "auth"."uid"()) OR (CURRENT_USER = ANY (ARRAY['supabase_auth_admin'::"name", 'service_role'::"name", 'postgres'::"name"]))));



CREATE POLICY "users_select_policy" ON "public"."users" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."get_current_user_context"() "ctx"("user_id", "organization_id", "role", "is_org_admin", "is_super_admin")
  WHERE (("ctx"."is_super_admin" = true) OR ((("ctx"."is_org_admin" = true) OR ("ctx"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"]))) AND ("ctx"."organization_id" IS NOT NULL) AND (("users"."organization_id" = "ctx"."organization_id") OR ("users"."organization_id" IS NULL))))))));



CREATE POLICY "users_update_policy" ON "public"."users" FOR UPDATE TO "authenticated" USING ((("id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."get_current_user_context"() "ctx"("user_id", "organization_id", "role", "is_org_admin", "is_super_admin")
  WHERE (("ctx"."is_super_admin" = true) OR (("ctx"."is_org_admin" = true) AND ("ctx"."organization_id" IS NOT NULL) AND ("users"."organization_id" = "ctx"."organization_id"))))))) WITH CHECK ((("id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."get_current_user_context"() "ctx"("user_id", "organization_id", "role", "is_org_admin", "is_super_admin")
  WHERE (("ctx"."is_super_admin" = true) OR (("ctx"."is_org_admin" = true) AND ("ctx"."organization_id" IS NOT NULL) AND ("users"."organization_id" = "ctx"."organization_id")))))));



ALTER TABLE "public"."vision_analysis_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vision_feature_flags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."warning_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "warning_logs_insert_policy" ON "public"."warning_logs" FOR INSERT WITH CHECK (("public"."is_super_admin"("auth"."uid"()) OR ("organization_id" = "public"."get_user_organization_id"("auth"."uid"()))));



CREATE POLICY "warning_logs_select_policy" ON "public"."warning_logs" FOR SELECT USING ((("auth"."uid"() = "user_id") OR "public"."is_super_admin"("auth"."uid"()) OR ("organization_id" = "public"."get_user_organization_id"("auth"."uid"()))));



ALTER TABLE "public"."warning_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."warning_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."worker_status" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."_extract_domain"("u" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_extract_domain"("u" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_extract_domain"("u" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_close_stale_sessions"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_close_stale_sessions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_close_stale_sessions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_employee_compliance"("target_user_id" "uuid", "target_month" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_employee_compliance"("target_user_id" "uuid", "target_month" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_employee_compliance"("target_user_id" "uuid", "target_month" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."close_user_active_sessions"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."close_user_active_sessions"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."close_user_active_sessions"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."close_user_active_sessions"("p_user_id" "uuid", "p_device_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."close_user_active_sessions"("p_user_id" "uuid", "p_device_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."close_user_active_sessions"("p_user_id" "uuid", "p_device_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."configure_service_role_key"("new_service_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."configure_service_role_key"("new_service_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."configure_service_role_key"("new_service_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_compliance_warning"("target_user_id" "uuid", "target_month" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."create_compliance_warning"("target_user_id" "uuid", "target_month" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_compliance_warning"("target_user_id" "uuid", "target_month" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_fraud_alert_notification"("alert_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_fraud_alert_notification"("alert_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_fraud_alert_notification"("alert_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_notification"("target_user_id" "uuid", "notification_type" "text", "notification_title" "text", "notification_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_notification"("target_user_id" "uuid", "notification_type" "text", "notification_title" "text", "notification_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_notification"("target_user_id" "uuid", "notification_type" "text", "notification_title" "text", "notification_message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_sample_analysis"("p_user_id" "uuid", "p_analysis_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."create_sample_analysis"("p_user_id" "uuid", "p_analysis_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_sample_analysis"("p_user_id" "uuid", "p_analysis_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."cron_run_ai_analysis"() TO "anon";
GRANT ALL ON FUNCTION "public"."cron_run_ai_analysis"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cron_run_ai_analysis"() TO "service_role";



GRANT ALL ON FUNCTION "public"."dismiss_warning"("warning_id" "uuid", "target_user_id" "uuid", "response" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."dismiss_warning"("warning_id" "uuid", "target_user_id" "uuid", "response" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dismiss_warning"("warning_id" "uuid", "target_user_id" "uuid", "response" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."find_duplicate_screenshots"("input_user_id" "uuid", "input_duplicate_hash" "text", "hours_back" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."find_duplicate_screenshots"("input_user_id" "uuid", "input_duplicate_hash" "text", "hours_back" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_duplicate_screenshots"("input_user_id" "uuid", "input_duplicate_hash" "text", "hours_back" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."find_similar_screenshots"("input_user_id" "uuid", "input_hash" "text", "hours_back" integer, "max_results" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."find_similar_screenshots"("input_user_id" "uuid", "input_hash" "text", "hours_back" integer, "max_results" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_similar_screenshots"("input_user_id" "uuid", "input_hash" "text", "hours_back" integer, "max_results" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_email_content_for_config"("config_record" "record", "report_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_email_content_for_config"("config_record" "record", "report_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_email_content_for_config"("config_record" "record", "report_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_employee_insights"("p_period_type" "text", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_employee_insights"("p_period_type" "text", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_employee_insights"("p_period_type" "text", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_report_data_for_config"("config_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_report_data_for_config"("config_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_report_data_for_config"("config_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_active_warnings_for_user"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_active_warnings_for_user"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_active_warnings_for_user"("target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_app_settings"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_app_settings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_app_settings"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_cron_job_status"("p_jobname" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_cron_job_status"("p_jobname" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_cron_job_status"("p_jobname" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_current_user_context"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_current_user_context"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_user_context"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_user_context"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_due_reports"("check_time" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_due_reports"("check_time" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_due_reports"("check_time" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_employee_finance_summary"("target_month" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_employee_finance_summary"("target_month" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_employee_finance_summary"("target_month" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_fraud_alerts_summary"("days_back" integer, "target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_fraud_alerts_summary"("days_back" integer, "target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_fraud_alerts_summary"("days_back" integer, "target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_organization_by_slug"("org_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_organization_by_slug"("org_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_organization_by_slug"("org_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_organization_cost_insights"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_organization_cost_insights"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_organization_cost_insights"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_privacy_risk_screenshots"("input_user_id" "uuid", "risk_threshold" integer, "hours_back" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_privacy_risk_screenshots"("input_user_id" "uuid", "risk_threshold" integer, "hours_back" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_privacy_risk_screenshots"("input_user_id" "uuid", "risk_threshold" integer, "hours_back" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_recent_http_stats"("p_since" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_recent_http_stats"("p_since" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_recent_http_stats"("p_since" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_organization_id"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_organization_id"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_organization_id"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_role"("uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role"("uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"("uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_worker_status"("worker_type_param" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_worker_status"("worker_type_param" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_worker_status"("worker_type_param" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hamming_distance_hex64"("a_hex" "text", "b_hex" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hamming_distance_hex64"("a_hex" "text", "b_hex" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hamming_distance_hex64"("a_hex" "text", "b_hex" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."infer_idle_screenshots"() TO "anon";
GRANT ALL ON FUNCTION "public"."infer_idle_screenshots"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."infer_idle_screenshots"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_admin"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_admin"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_admin"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_report_send"("p_config_id" "uuid", "p_status" "text", "p_recipient_count" integer, "p_error_message" "text", "p_email_service_id" "text", "p_report_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_report_send"("p_config_id" "uuid", "p_status" "text", "p_recipient_count" integer, "p_error_message" "text", "p_email_service_id" "text", "p_report_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_report_send"("p_config_id" "uuid", "p_status" "text", "p_recipient_count" integer, "p_error_message" "text", "p_email_service_id" "text", "p_report_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_warning_shown"("warning_id" "uuid", "target_user_id" "uuid", "action" "text", "response" "text", "warning_context" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_warning_shown"("warning_id" "uuid", "target_user_id" "uuid", "action" "text", "response" "text", "warning_context" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_warning_shown"("warning_id" "uuid", "target_user_id" "uuid", "action" "text", "response" "text", "warning_context" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_screenshot_for_reanalysis"("screenshot_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_screenshot_for_reanalysis"("screenshot_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_screenshot_for_reanalysis"("screenshot_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_employee_status_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_employee_status_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_employee_status_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_new_employee_welcome"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_new_employee_welcome"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_new_employee_welcome"() TO "service_role";



GRANT ALL ON FUNCTION "public"."pause_user"("target_user_id" "uuid", "admin_user_id" "uuid", "reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pause_user"("target_user_id" "uuid", "admin_user_id" "uuid", "reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pause_user"("target_user_id" "uuid", "admin_user_id" "uuid", "reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_notification_queue"("batch_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."process_notification_queue"("batch_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_notification_queue"("batch_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."process_pending_screenshots"("batch_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."process_pending_screenshots"("batch_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_pending_screenshots"("batch_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."process_scheduled_reports_direct"("report_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."process_scheduled_reports_direct"("report_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_scheduled_reports_direct"("report_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_subject_template"("template" "text", "report_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."process_subject_template"("template" "text", "report_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_subject_template"("template" "text", "report_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."run_ai_employee_analysis"() TO "anon";
GRANT ALL ON FUNCTION "public"."run_ai_employee_analysis"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_ai_employee_analysis"() TO "service_role";



GRANT ALL ON FUNCTION "public"."run_ai_screenshot_analyzer"() TO "anon";
GRANT ALL ON FUNCTION "public"."run_ai_screenshot_analyzer"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_ai_screenshot_analyzer"() TO "service_role";



GRANT ALL ON FUNCTION "public"."run_insights_generator"() TO "anon";
GRANT ALL ON FUNCTION "public"."run_insights_generator"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_insights_generator"() TO "service_role";



GRANT ALL ON FUNCTION "public"."run_insights_generator_per_org"() TO "anon";
GRANT ALL ON FUNCTION "public"."run_insights_generator_per_org"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_insights_generator_per_org"() TO "service_role";



GRANT ALL ON FUNCTION "public"."run_notification_processor"() TO "anon";
GRANT ALL ON FUNCTION "public"."run_notification_processor"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_notification_processor"() TO "service_role";



GRANT ALL ON FUNCTION "public"."run_screenshot_cleanup"() TO "anon";
GRANT ALL ON FUNCTION "public"."run_screenshot_cleanup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_screenshot_cleanup"() TO "service_role";



GRANT ALL ON FUNCTION "public"."run_screenshot_processor"() TO "anon";
GRANT ALL ON FUNCTION "public"."run_screenshot_processor"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_screenshot_processor"() TO "service_role";



GRANT ALL ON FUNCTION "public"."run_system_health_alert"() TO "anon";
GRANT ALL ON FUNCTION "public"."run_system_health_alert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_system_health_alert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."run_vision_validator"() TO "anon";
GRANT ALL ON FUNCTION "public"."run_vision_validator"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_vision_validator"() TO "service_role";



GRANT ALL ON FUNCTION "public"."send_daily_hours_alert_per_org"() TO "anon";
GRANT ALL ON FUNCTION "public"."send_daily_hours_alert_per_org"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_daily_hours_alert_per_org"() TO "service_role";



GRANT ALL ON FUNCTION "public"."send_email_reports_per_org"("report_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."send_email_reports_per_org"("report_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_email_reports_per_org"("report_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."send_email_via_resend"("to_emails" "text"[], "subject" "text", "html_content" "text", "from_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."send_email_via_resend"("to_emails" "text"[], "subject" "text", "html_content" "text", "from_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_email_via_resend"("to_emails" "text"[], "subject" "text", "html_content" "text", "from_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_organization_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_organization_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_organization_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_screenshot_timestamps"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_screenshot_timestamps"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_screenshot_timestamps"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_employee_notification"("employee_id" "uuid", "change_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_employee_notification"("employee_id" "uuid", "change_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_employee_notification"("employee_id" "uuid", "change_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_fraud_alert_notification"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_fraud_alert_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_fraud_alert_notification"() TO "service_role";



GRANT ALL ON FUNCTION "public"."unpause_user"("target_user_id" "uuid", "admin_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."unpause_user"("target_user_id" "uuid", "admin_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unpause_user"("target_user_id" "uuid", "admin_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_ai_analysis_metrics"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_ai_analysis_metrics"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ai_analysis_metrics"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_app_settings_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_app_settings_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_app_settings_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_consecutive_duplicate_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_consecutive_duplicate_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_consecutive_duplicate_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_manual_hours_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_manual_hours_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_manual_hours_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."url_logs_view_insert"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."url_logs_view_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."url_logs_view_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."url_logs_view_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."url_logs_view_ud_block"() TO "anon";
GRANT ALL ON FUNCTION "public"."url_logs_view_ud_block"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."url_logs_view_ud_block"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_user_organization"("user_email" "text", "org_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_user_organization"("user_email" "text", "org_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_user_organization"("user_email" "text", "org_slug" "text") TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."active_employees" TO "anon";
GRANT ALL ON TABLE "public"."active_employees" TO "authenticated";
GRANT ALL ON TABLE "public"."active_employees" TO "service_role";



GRANT ALL ON TABLE "public"."activities" TO "anon";
GRANT ALL ON TABLE "public"."activities" TO "authenticated";
GRANT ALL ON TABLE "public"."activities" TO "service_role";



GRANT ALL ON TABLE "public"."admin_alerts" TO "anon";
GRANT ALL ON TABLE "public"."admin_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."ai_analysis_metrics" TO "anon";
GRANT ALL ON TABLE "public"."ai_analysis_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_analysis_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."ai_analysis_queue" TO "anon";
GRANT ALL ON TABLE "public"."ai_analysis_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_analysis_queue" TO "service_role";



GRANT ALL ON TABLE "public"."screenshots" TO "anon";
GRANT ALL ON TABLE "public"."screenshots" TO "authenticated";
GRANT ALL ON TABLE "public"."screenshots" TO "service_role";



GRANT ALL ON TABLE "public"."ai_analysis_stats" TO "anon";
GRANT ALL ON TABLE "public"."ai_analysis_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_analysis_stats" TO "service_role";



GRANT ALL ON TABLE "public"."ai_employee_insights" TO "anon";
GRANT ALL ON TABLE "public"."ai_employee_insights" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_employee_insights" TO "service_role";



GRANT ALL ON TABLE "public"."ai_user_patterns" TO "anon";
GRANT ALL ON TABLE "public"."ai_user_patterns" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_user_patterns" TO "service_role";



GRANT ALL ON TABLE "public"."alert_summary" TO "anon";
GRANT ALL ON TABLE "public"."alert_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."alert_summary" TO "service_role";



GRANT ALL ON TABLE "public"."app_logs" TO "anon";
GRANT ALL ON TABLE "public"."app_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."app_logs" TO "service_role";



GRANT ALL ON TABLE "public"."app_settings" TO "anon";
GRANT ALL ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



GRANT ALL ON TABLE "public"."app_url_activity" TO "anon";
GRANT ALL ON TABLE "public"."app_url_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."app_url_activity" TO "service_role";



GRANT ALL ON TABLE "public"."app_usage_analytics" TO "anon";
GRANT ALL ON TABLE "public"."app_usage_analytics" TO "authenticated";
GRANT ALL ON TABLE "public"."app_usage_analytics" TO "service_role";



GRANT ALL ON TABLE "public"."time_logs" TO "anon";
GRANT ALL ON TABLE "public"."time_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."time_logs" TO "service_role";



GRANT ALL ON TABLE "public"."daily_activity_summary" TO "anon";
GRANT ALL ON TABLE "public"."daily_activity_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_activity_summary" TO "service_role";



GRANT ALL ON TABLE "public"."duplicate_screenshots_summary" TO "anon";
GRANT ALL ON TABLE "public"."duplicate_screenshots_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."duplicate_screenshots_summary" TO "service_role";



GRANT ALL ON TABLE "public"."employee_analysis_requests" TO "anon";
GRANT ALL ON TABLE "public"."employee_analysis_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_analysis_requests" TO "service_role";



GRANT ALL ON TABLE "public"."employee_behavioral_patterns" TO "anon";
GRANT ALL ON TABLE "public"."employee_behavioral_patterns" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_behavioral_patterns" TO "service_role";



GRANT ALL ON TABLE "public"."employee_comprehensive_analysis" TO "anon";
GRANT ALL ON TABLE "public"."employee_comprehensive_analysis" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_comprehensive_analysis" TO "service_role";



GRANT ALL ON TABLE "public"."employee_daily_activities" TO "anon";
GRANT ALL ON TABLE "public"."employee_daily_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_daily_activities" TO "service_role";



GRANT ALL ON TABLE "public"."employee_deductions" TO "anon";
GRANT ALL ON TABLE "public"."employee_deductions" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_deductions" TO "service_role";



GRANT ALL ON TABLE "public"."employee_management_insights" TO "anon";
GRANT ALL ON TABLE "public"."employee_management_insights" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_management_insights" TO "service_role";



GRANT ALL ON TABLE "public"."employee_project_assignments" TO "anon";
GRANT ALL ON TABLE "public"."employee_project_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_project_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."employee_warnings" TO "anon";
GRANT ALL ON TABLE "public"."employee_warnings" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_warnings" TO "service_role";



GRANT ALL ON TABLE "public"."employee_working_standards" TO "anon";
GRANT ALL ON TABLE "public"."employee_working_standards" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_working_standards" TO "service_role";



GRANT ALL ON TABLE "public"."fraud_alerts" TO "anon";
GRANT ALL ON TABLE "public"."fraud_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."fraud_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."idle_logs" TO "anon";
GRANT ALL ON TABLE "public"."idle_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."idle_logs" TO "service_role";



GRANT ALL ON TABLE "public"."idle_analytics" TO "anon";
GRANT ALL ON TABLE "public"."idle_analytics" TO "authenticated";
GRANT ALL ON TABLE "public"."idle_analytics" TO "service_role";



GRANT ALL ON TABLE "public"."inactive_employees" TO "anon";
GRANT ALL ON TABLE "public"."inactive_employees" TO "authenticated";
GRANT ALL ON TABLE "public"."inactive_employees" TO "service_role";



GRANT ALL ON TABLE "public"."latest_employee_analysis" TO "anon";
GRANT ALL ON TABLE "public"."latest_employee_analysis" TO "authenticated";
GRANT ALL ON TABLE "public"."latest_employee_analysis" TO "service_role";



GRANT ALL ON TABLE "public"."manual_hours" TO "anon";
GRANT ALL ON TABLE "public"."manual_hours" TO "authenticated";
GRANT ALL ON TABLE "public"."manual_hours" TO "service_role";



GRANT ALL ON TABLE "public"."manual_hours_audit" TO "anon";
GRANT ALL ON TABLE "public"."manual_hours_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."manual_hours_audit" TO "service_role";



GRANT ALL ON TABLE "public"."notification_log" TO "anon";
GRANT ALL ON TABLE "public"."notification_log" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_log" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."perceptual_hash_duplicates" TO "anon";
GRANT ALL ON TABLE "public"."perceptual_hash_duplicates" TO "authenticated";
GRANT ALL ON TABLE "public"."perceptual_hash_duplicates" TO "service_role";



GRANT ALL ON TABLE "public"."productivity_metrics" TO "anon";
GRANT ALL ON TABLE "public"."productivity_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."productivity_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."report_configurations" TO "anon";
GRANT ALL ON TABLE "public"."report_configurations" TO "authenticated";
GRANT ALL ON TABLE "public"."report_configurations" TO "service_role";



GRANT ALL ON TABLE "public"."report_history" TO "anon";
GRANT ALL ON TABLE "public"."report_history" TO "authenticated";
GRANT ALL ON TABLE "public"."report_history" TO "service_role";



GRANT ALL ON TABLE "public"."report_recipients" TO "anon";
GRANT ALL ON TABLE "public"."report_recipients" TO "authenticated";
GRANT ALL ON TABLE "public"."report_recipients" TO "service_role";



GRANT ALL ON TABLE "public"."report_types" TO "anon";
GRANT ALL ON TABLE "public"."report_types" TO "authenticated";
GRANT ALL ON TABLE "public"."report_types" TO "service_role";



GRANT ALL ON TABLE "public"."screenshot_comments" TO "anon";
GRANT ALL ON TABLE "public"."screenshot_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."screenshot_comments" TO "service_role";



GRANT ALL ON TABLE "public"."screenshot_deletions" TO "anon";
GRANT ALL ON TABLE "public"."screenshot_deletions" TO "authenticated";
GRANT ALL ON TABLE "public"."screenshot_deletions" TO "service_role";



GRANT ALL ON TABLE "public"."settings" TO "anon";
GRANT ALL ON TABLE "public"."settings" TO "authenticated";
GRANT ALL ON TABLE "public"."settings" TO "service_role";



GRANT ALL ON TABLE "public"."suspicious_activity" TO "anon";
GRANT ALL ON TABLE "public"."suspicious_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."suspicious_activity" TO "service_role";



GRANT ALL ON TABLE "public"."system_checks" TO "anon";
GRANT ALL ON TABLE "public"."system_checks" TO "authenticated";
GRANT ALL ON TABLE "public"."system_checks" TO "service_role";



GRANT ALL ON TABLE "public"."system_logs" TO "anon";
GRANT ALL ON TABLE "public"."system_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."system_logs" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."team_leader_assignments" TO "anon";
GRANT ALL ON TABLE "public"."team_leader_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."team_leader_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."url_logs" TO "anon";
GRANT ALL ON TABLE "public"."url_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."url_logs" TO "service_role";



GRANT ALL ON TABLE "public"."url_logs_old" TO "anon";
GRANT ALL ON TABLE "public"."url_logs_old" TO "authenticated";
GRANT ALL ON TABLE "public"."url_logs_old" TO "service_role";



GRANT ALL ON TABLE "public"."url_usage_analytics" TO "anon";
GRANT ALL ON TABLE "public"."url_usage_analytics" TO "authenticated";
GRANT ALL ON TABLE "public"."url_usage_analytics" TO "service_role";



GRANT ALL ON TABLE "public"."user_agent_versions" TO "anon";
GRANT ALL ON TABLE "public"."user_agent_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_agent_versions" TO "service_role";



GRANT ALL ON TABLE "public"."user_invites" TO "anon";
GRANT ALL ON TABLE "public"."user_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."user_invites" TO "service_role";



GRANT ALL ON TABLE "public"."vision_analysis_metrics" TO "anon";
GRANT ALL ON TABLE "public"."vision_analysis_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."vision_analysis_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."vision_feature_flags" TO "anon";
GRANT ALL ON TABLE "public"."vision_feature_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."vision_feature_flags" TO "service_role";



GRANT ALL ON TABLE "public"."warning_logs" TO "anon";
GRANT ALL ON TABLE "public"."warning_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."warning_logs" TO "service_role";



GRANT ALL ON TABLE "public"."warning_messages" TO "anon";
GRANT ALL ON TABLE "public"."warning_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."warning_messages" TO "service_role";



GRANT ALL ON TABLE "public"."warning_templates" TO "anon";
GRANT ALL ON TABLE "public"."warning_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."warning_templates" TO "service_role";



GRANT ALL ON TABLE "public"."worker_status" TO "anon";
GRANT ALL ON TABLE "public"."worker_status" TO "authenticated";
GRANT ALL ON TABLE "public"."worker_status" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







