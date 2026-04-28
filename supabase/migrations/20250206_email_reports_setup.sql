-- Email Reports System Migration
-- This migration sets up the complete email reporting system for daily and weekly reports

-- Enable required extensions for email reports
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create report types table
CREATE TABLE IF NOT EXISTS public.report_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  template_type VARCHAR(50) NOT NULL, -- 'daily', 'weekly', 'monthly', 'custom'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create report configurations table
CREATE TABLE IF NOT EXISTS public.report_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type_id UUID REFERENCES public.report_types(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  schedule_cron VARCHAR(100), -- Cron expression for scheduling
  schedule_description VARCHAR(200), -- Human readable schedule
  is_active BOOLEAN DEFAULT true,
  
  -- Email settings
  subject_template TEXT NOT NULL,
  include_summary BOOLEAN DEFAULT true,
  include_employee_details BOOLEAN DEFAULT true,
  include_alerts BOOLEAN DEFAULT true,
  include_projects BOOLEAN DEFAULT true,
  
  -- Alert thresholds (JSON)
  alert_settings JSONB DEFAULT '{}',
  
  -- Filters (JSON) - which employees, projects, etc.
  filters JSONB DEFAULT '{}',
  
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create report recipients table
CREATE TABLE IF NOT EXISTS public.report_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_config_id UUID REFERENCES public.report_configurations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(report_config_id, user_id)
);

-- Create report history table
CREATE TABLE IF NOT EXISTS public.report_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_config_id UUID REFERENCES public.report_configurations(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  recipient_count INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'sent', -- 'sent', 'failed', 'test'
  error_message TEXT,
  email_service_id VARCHAR(100), -- ID from email service (like Resend)
  
  -- Store the actual data that was sent (for debugging)
  report_data JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default report types
INSERT INTO public.report_types (name, description, template_type, is_active) 
VALUES 
  ('Daily Work Summary', 'Comprehensive daily team performance report', 'daily', true),
  ('Weekly Performance Report', 'Weekly achievements, badges, and productivity analysis', 'weekly', true),
  ('Monthly Review', 'Monthly comprehensive team analysis', 'monthly', true),
  ('Alert Report', 'Immediate alerts for critical issues', 'custom', true)
ON CONFLICT (name) DO NOTHING;

-- Insert default configurations
INSERT INTO public.report_configurations (
  report_type_id, 
  name, 
  description, 
  schedule_cron, 
  schedule_description,
  subject_template,
  alert_settings,
  is_active
)
SELECT
  (SELECT id FROM public.report_types WHERE name = 'Daily Work Summary'),
  'Daily Team Performance Report',
  'Automated daily report sent to all admins at 7 PM',
  '0 19 * * *',
  'Every day at 7:00 PM',
  '📅 Daily Team Performance Summary – {date}',
  '{"idle_threshold": 15, "late_start_threshold": 180, "toggle_threshold": 10}',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.report_configurations rc
  WHERE rc.name = 'Daily Team Performance Report'
);

INSERT INTO public.report_configurations (
  report_type_id, 
  name, 
  description, 
  schedule_cron, 
  schedule_description,
  subject_template,
  alert_settings,
  is_active
)
SELECT
  (SELECT id FROM public.report_types WHERE name = 'Weekly Performance Report'),
  'Weekly Team Summary Report', 
  'Automated weekly report sent to all admins on Monday at 9 AM',
  '0 9 * * 1',
  'Every Monday at 9:00 AM',
  '📊 Weekly Performance Summary – {start_date} to {end_date}',
  '{"low_productivity_days": 3, "low_productivity_threshold": 30}',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.report_configurations rc
  WHERE rc.name = 'Weekly Team Summary Report'
);

-- Insert admin users as report recipients (if admin users exist)
INSERT INTO public.report_recipients (report_config_id, email, user_id, is_active)
SELECT 
  rc.id as report_config_id,
  u.email,
  u.id as user_id,
  true as is_active
FROM public.report_configurations rc
CROSS JOIN public.users u
WHERE u.role IN ('admin', 'manager')
  AND u.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.report_recipients rr 
    WHERE rr.report_config_id = rc.id 
    AND rr.user_id = u.id
  );

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_report_types_active ON public.report_types(is_active);
CREATE INDEX IF NOT EXISTS idx_report_configurations_active ON public.report_configurations(is_active);
CREATE INDEX IF NOT EXISTS idx_report_recipients_config ON public.report_recipients(report_config_id);
CREATE INDEX IF NOT EXISTS idx_report_history_config_date ON public.report_history(report_config_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_report_history_status ON public.report_history(status);

-- Enable RLS
ALTER TABLE public.report_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage all report types" ON public.report_types
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "Admins can manage all report configurations" ON public.report_configurations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "Admins can manage all report recipients" ON public.report_recipients
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "Admins can view all report history" ON public.report_history
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'manager')
        )
    );

-- Service role can insert report history
CREATE POLICY "Service role can insert report history" ON public.report_history
    FOR INSERT WITH CHECK (true);

-- Function to get active report configurations due for sending
CREATE OR REPLACE FUNCTION get_due_reports(check_time TIMESTAMPTZ DEFAULT NOW())
RETURNS TABLE (
    config_id UUID,
    config_name TEXT,
    template_type TEXT,
    subject_template TEXT,
    recipients JSON
) AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log report send attempts
CREATE OR REPLACE FUNCTION log_report_send(
    p_config_id UUID,
    p_status TEXT,
    p_recipient_count INTEGER DEFAULT 0,
    p_error_message TEXT DEFAULT NULL,
    p_email_service_id TEXT DEFAULT NULL,
    p_report_data JSONB DEFAULT NULL
) RETURNS UUID AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at columns
DROP TRIGGER IF EXISTS update_report_types_updated_at ON public.report_types;
CREATE TRIGGER update_report_types_updated_at 
    BEFORE UPDATE ON public.report_types 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_report_configurations_updated_at ON public.report_configurations;
CREATE TRIGGER update_report_configurations_updated_at 
    BEFORE UPDATE ON public.report_configurations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.report_types TO authenticated;
GRANT ALL ON public.report_configurations TO authenticated;
GRANT ALL ON public.report_recipients TO authenticated;
GRANT SELECT ON public.report_history TO authenticated;
GRANT EXECUTE ON FUNCTION get_due_reports TO authenticated;
GRANT EXECUTE ON FUNCTION log_report_send TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE public.report_types IS 'Types of reports that can be generated (daily, weekly, etc.)';
COMMENT ON TABLE public.report_configurations IS 'Configuration for scheduled email reports';
COMMENT ON TABLE public.report_recipients IS 'Users who should receive specific reports';
COMMENT ON TABLE public.report_history IS 'History of sent reports for tracking and debugging';
COMMENT ON FUNCTION get_due_reports IS 'Gets report configurations that are due to be sent';
COMMENT ON FUNCTION log_report_send IS 'Logs report send attempts with status and details'; 