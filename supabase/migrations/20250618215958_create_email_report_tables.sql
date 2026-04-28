
-- Create tables for email reports system
CREATE TABLE IF NOT EXISTS report_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  template_type TEXT NOT NULL, -- 'daily', 'weekly', 'monthly'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default report types
INSERT INTO report_types (name, description, template_type)
SELECT 'Daily Work Summary', 'Daily team performance report with hours, activity, and productivity metrics', 'daily'
WHERE NOT EXISTS (SELECT 1 FROM report_types WHERE name = 'Daily Work Summary');

INSERT INTO report_types (name, description, template_type)
SELECT 'Weekly Performance Report', 'Weekly team achievements, badges, and productivity analysis', 'weekly'
WHERE NOT EXISTS (SELECT 1 FROM report_types WHERE name = 'Weekly Performance Report');

INSERT INTO report_types (name, description, template_type)
SELECT 'Monthly Team Review', 'Comprehensive monthly team performance and project analysis', 'monthly'
WHERE NOT EXISTS (SELECT 1 FROM report_types WHERE name = 'Monthly Team Review');

-- Create report configurations table
CREATE TABLE IF NOT EXISTS report_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  report_type_id UUID REFERENCES report_types(id),
  schedule_cron TEXT, -- e.g., '0 19 * * *' for daily at 7 PM
  schedule_description TEXT, -- Human readable schedule
  subject_template TEXT NOT NULL,
  include_summary BOOLEAN DEFAULT true,
  include_employee_details BOOLEAN DEFAULT true,
  include_alerts BOOLEAN DEFAULT true,
  include_projects BOOLEAN DEFAULT true,
  alert_settings JSONB DEFAULT '{}',
  filters JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create report recipients table
CREATE TABLE IF NOT EXISTS report_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_config_id UUID REFERENCES report_configurations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  email TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create report history table
CREATE TABLE IF NOT EXISTS report_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_config_id UUID REFERENCES report_configurations(id),
  recipient_count INTEGER DEFAULT 0,
  status TEXT NOT NULL, -- 'sent', 'failed', 'test'
  email_service_id TEXT, -- ID from email service
  report_data JSONB,
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_report_configurations_active ON report_configurations(is_active);
CREATE INDEX IF NOT EXISTS idx_report_recipients_config ON report_recipients(report_config_id);
CREATE INDEX IF NOT EXISTS idx_report_history_config ON report_history(report_config_id);
CREATE INDEX IF NOT EXISTS idx_report_history_sent_at ON report_history(sent_at);
