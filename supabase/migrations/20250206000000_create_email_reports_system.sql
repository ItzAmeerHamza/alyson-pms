-- Email Reports Configuration System
-- This allows admins to dynamically configure what reports to send and when

-- Table to store different report types
CREATE TABLE report_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  template_type VARCHAR(50) NOT NULL, -- 'daily', 'weekly', 'monthly', 'custom'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table to store report configurations 
CREATE TABLE report_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type_id UUID REFERENCES report_types(id) ON DELETE CASCADE,
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
  
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table to store admin users who should receive reports
CREATE TABLE report_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_config_id UUID REFERENCES report_configurations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(report_config_id, user_id)
);

-- Table to track sent reports
CREATE TABLE report_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_config_id UUID REFERENCES report_configurations(id) ON DELETE CASCADE,
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
INSERT INTO report_types (name, description, template_type) VALUES 
  ('Daily Performance', 'Daily team performance summary with hours, activity, and alerts', 'daily'),
  ('Weekly Summary', 'Weekly team performance overview with patterns and trends', 'weekly'),
  ('Monthly Review', 'Monthly comprehensive team analysis', 'monthly'),
  ('Alert Report', 'Immediate alerts for critical issues', 'custom');

-- Insert default configurations
INSERT INTO report_configurations (
  report_type_id, 
  name, 
  description, 
  schedule_cron, 
  schedule_description,
  subject_template,
  alert_settings
) VALUES 
  (
    (SELECT id FROM report_types WHERE name = 'Daily Performance'),
    'Daily Team Performance Report',
    'Automated daily report sent to all admins at 7 PM',
    '0 19 * * *',
    'Every day at 7:00 PM',
    '📅 Daily Team Performance Summary – {date}',
    '{"idle_threshold": 15, "late_start_threshold": 180, "toggle_threshold": 10}'
  ),
  (
    (SELECT id FROM report_types WHERE name = 'Weekly Summary'),
    'Weekly Team Summary Report', 
    'Automated weekly report sent to all admins on Monday at 9 AM',
    '0 9 * * 1',
    'Every Monday at 9:00 AM',
    '📊 Weekly Performance Summary – {start_date} to {end_date}',
    '{"low_productivity_days": 3, "low_productivity_threshold": 30}'
  );

-- Add indexes for performance
CREATE INDEX idx_report_configurations_active ON report_configurations(is_active);
CREATE INDEX idx_report_recipients_config ON report_recipients(report_config_id);
CREATE INDEX idx_report_history_config_date ON report_history(report_config_id, sent_at);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_report_types_updated_at BEFORE UPDATE ON report_types FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_report_configurations_updated_at BEFORE UPDATE ON report_configurations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 