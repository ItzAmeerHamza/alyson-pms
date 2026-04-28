-- ============================================================================
-- FIX EMAIL REPORTS WITH DIRECT RESEND API INTEGRATION
-- ============================================================================
-- This migration creates a database function that sends emails directly using
-- Resend API, bypassing Edge Function authentication issues for cron jobs.

-- Enable the http extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "http";

-- pg_cron powers the `cron` schema. New Supabase projects may not have it enabled yet,
-- so all cron operations in this migration must be conditional.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a function to send emails directly via Resend API
CREATE OR REPLACE FUNCTION public.send_email_via_resend(
    to_emails TEXT[],
    subject TEXT,
    html_content TEXT,
    from_email TEXT DEFAULT 'Ebdaa work time Reports <info@ebdaadt.com>'
)
RETURNS JSONB
LANGUAGE plpgsql
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

-- Create a function to process scheduled reports using direct Resend API
CREATE OR REPLACE FUNCTION public.process_scheduled_reports_direct(
    report_type TEXT DEFAULT 'all'
)
RETURNS JSONB
LANGUAGE plpgsql
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

-- Helper function to generate report data
CREATE OR REPLACE FUNCTION public.generate_report_data_for_config(config_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
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

-- Helper function to generate email content
CREATE OR REPLACE FUNCTION public.generate_email_content_for_config(
    config_record RECORD,
    report_data JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
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

-- Helper function to process subject templates
CREATE OR REPLACE FUNCTION public.process_subject_template(
    template TEXT,
    report_data JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
    -- Simple template processing - replace {date} with actual date
    RETURN REPLACE(template, '{date}', COALESCE(report_data->>'date', CURRENT_DATE::text));
END;
$$;

-- Update cron jobs to use the new direct function (safe unschedule + schedule)
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-email-reports') THEN
      PERFORM cron.unschedule('daily-email-reports');
    END IF;

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-email-reports') THEN
      PERFORM cron.unschedule('weekly-email-reports');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-email-reports-direct') THEN
      PERFORM cron.schedule(
        'daily-email-reports-direct',
        '0 19 * * *', -- Daily at 7 PM
        'SELECT process_scheduled_reports_direct(''daily'');'
      );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-email-reports-direct') THEN
      PERFORM cron.schedule(
        'weekly-email-reports-direct',
        '0 9 * * 0', -- Weekly on Sunday at 9 AM
        'SELECT process_scheduled_reports_direct(''weekly'');'
      );
    END IF;
  ELSE
    RAISE NOTICE 'Skipping email report pg_cron setup: pg_cron extension is not available on this database.';
  END IF;
END;
$cron$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.send_email_via_resend(TEXT[], TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_scheduled_reports_direct(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_report_data_for_config(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_email_content_for_config(RECORD, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_subject_template(TEXT, JSONB) TO authenticated;

-- Create settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert the Resend API key setting (you'll need to update this with your actual key)
-- This is just a placeholder - you need to set it in Supabase Dashboard
INSERT INTO public.settings (key, value, description) 
VALUES ('resend_api_key', 'YOUR_RESEND_API_KEY_HERE', 'Resend API key for sending emails')
ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value,
    description = EXCLUDED.description;

-- Add comment explaining how to set the API key
COMMENT ON TABLE public.settings IS 'Application settings. Set resend_api_key here or in Supabase Dashboard → Settings → Environment Variables';
COMMENT ON COLUMN public.settings.value IS 'Value for the setting. For resend_api_key, use your actual Resend API key from https://resend.com/api-keys';

