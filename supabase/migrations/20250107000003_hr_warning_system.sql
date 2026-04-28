-- HR Warning System Migration
-- This migration sets up the warning message system for employees

-- Table for storing customizable warning messages
CREATE TABLE IF NOT EXISTS public.warning_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  target_audience TEXT DEFAULT 'all' CHECK (target_audience IN ('all', 'employee', 'specific')),
  target_user_ids UUID[] DEFAULT '{}', -- Array of specific user IDs if target_audience is 'specific'
  is_active BOOLEAN DEFAULT TRUE,
  display_frequency TEXT DEFAULT 'always' CHECK (display_frequency IN ('always', 'once', 'daily', 'weekly')),
  trigger_conditions JSONB DEFAULT '{}', -- JSON object for trigger conditions
  created_by UUID REFERENCES public.users(id) NOT NULL,
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for logging when warnings are shown to users
CREATE TABLE IF NOT EXISTS public.warning_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  warning_message_id UUID REFERENCES public.warning_messages(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  shown_at TIMESTAMPTZ DEFAULT NOW(),
  dismissed_at TIMESTAMPTZ,
  action_taken TEXT, -- 'acknowledged', 'dismissed', 'ignored'
  user_response TEXT, -- Optional user response/feedback
  context JSONB DEFAULT '{}', -- Additional context about when/why warning was shown
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for warning templates (predefined warning messages)
CREATE TABLE IF NOT EXISTS public.warning_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  category TEXT NOT NULL, -- 'productivity', 'attendance', 'policy', 'general'
  description TEXT,
  is_system BOOLEAN DEFAULT FALSE, -- Whether this is a system template
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_warning_messages_active ON public.warning_messages(is_active);
CREATE INDEX IF NOT EXISTS idx_warning_messages_target ON public.warning_messages(target_audience);
CREATE INDEX IF NOT EXISTS idx_warning_messages_valid_period ON public.warning_messages(valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_warning_logs_user_id ON public.warning_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_warning_logs_message_id ON public.warning_logs(warning_message_id);
CREATE INDEX IF NOT EXISTS idx_warning_logs_shown_at ON public.warning_logs(shown_at);
CREATE INDEX IF NOT EXISTS idx_warning_templates_category ON public.warning_templates(category);

-- Enable RLS
ALTER TABLE public.warning_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warning_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warning_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for warning_messages
CREATE POLICY "Admins can manage all warning messages" ON public.warning_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Employees can view warnings targeted to them" ON public.warning_messages
  FOR SELECT USING (
    is_active = TRUE 
    AND (valid_from IS NULL OR valid_from <= NOW())
    AND (valid_until IS NULL OR valid_until >= NOW())
    AND (
      target_audience = 'all' 
      OR (target_audience = 'employee' AND EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() 
        AND role = 'employee'
      ))
      OR (target_audience = 'specific' AND auth.uid() = ANY(target_user_ids))
    )
  );

-- RLS Policies for warning_logs
CREATE POLICY "Admins can view all warning logs" ON public.warning_logs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Users can view their own warning logs" ON public.warning_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own warning logs" ON public.warning_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own warning logs" ON public.warning_logs
  FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for warning_templates
CREATE POLICY "Admins can manage warning templates" ON public.warning_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "All users can view warning templates" ON public.warning_templates
  FOR SELECT USING (TRUE);

-- Function to get active warnings for a user
CREATE OR REPLACE FUNCTION get_active_warnings_for_user(target_user_id UUID)
RETURNS TABLE (
  warning_id UUID,
  title TEXT,
  message TEXT,
  severity TEXT,
  display_frequency TEXT,
  last_shown TIMESTAMPTZ
) AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log a warning shown to user
CREATE OR REPLACE FUNCTION log_warning_shown(
  warning_id UUID,
  target_user_id UUID,
  action TEXT DEFAULT 'shown',
  response TEXT DEFAULT NULL,
  warning_context JSONB DEFAULT '{}'
) RETURNS UUID AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to dismiss a warning
CREATE OR REPLACE FUNCTION dismiss_warning(
  warning_id UUID,
  target_user_id UUID,
  response TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert default warning templates
INSERT INTO public.warning_templates (name, title, message, severity, category, description, is_system) VALUES
  (
    'low_productivity_warning',
    'Productivity Reminder',
    'Your recent activity levels have been below average. Please ensure you are staying focused and productive during work hours. If you need assistance or have concerns, please reach out to your supervisor.',
    'medium',
    'productivity',
    'Warning for employees with consistently low productivity scores',
    TRUE
  ),
  (
    'attendance_reminder',
    'Attendance Reminder',
    'Please remember to maintain regular work hours and notify your supervisor of any planned absences. Consistent attendance is important for team productivity and project success.',
    'medium',
    'attendance',
    'Reminder about attendance policies and expectations',
    TRUE
  ),
  (
    'time_tracking_compliance',
    'Time Tracking Compliance',
    'Please ensure you are properly tracking your work time and taking appropriate breaks. Accurate time tracking helps us maintain transparency and ensure fair compensation.',
    'low',
    'policy',
    'Reminder about proper time tracking procedures',
    TRUE
  ),
  (
    'security_reminder',
    'Security Reminder',
    'Please remember to follow company security policies: lock your screen when away, use strong passwords, and report any suspicious activity immediately.',
    'high',
    'policy',
    'Important security policy reminder',
    TRUE
  ),
  (
    'performance_improvement',
    'Performance Improvement Notice',
    'Your recent performance metrics indicate areas for improvement. Please schedule a meeting with your supervisor to discuss development opportunities and support available to help you succeed.',
    'high',
    'productivity',
    'Formal notice for performance improvement requirements',
    TRUE
  ),
  (
    'general_welcome',
    'Welcome Message',
    'Welcome to your workday! Remember to stay focused, take regular breaks, and reach out if you need any assistance. Have a productive day!',
    'low',
    'general',
    'Friendly welcome message for daily motivation',
    TRUE
  )
ON CONFLICT (name) DO NOTHING;

-- Create updated_at triggers
CREATE TRIGGER update_warning_messages_updated_at
    BEFORE UPDATE ON public.warning_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_warning_templates_updated_at
    BEFORE UPDATE ON public.warning_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_active_warnings_for_user TO authenticated;
GRANT EXECUTE ON FUNCTION log_warning_shown TO authenticated;
GRANT EXECUTE ON FUNCTION dismiss_warning TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE public.warning_messages IS 'Stores customizable warning messages that can be shown to employees';
COMMENT ON TABLE public.warning_logs IS 'Logs when warnings are shown to users and their responses';
COMMENT ON TABLE public.warning_templates IS 'Predefined warning message templates for common scenarios';
COMMENT ON FUNCTION get_active_warnings_for_user(UUID) IS 'Returns active warnings for a specific user based on frequency and target criteria';
COMMENT ON FUNCTION log_warning_shown(UUID, UUID, TEXT, TEXT, JSONB) IS 'Logs when a warning is shown to a user with optional context';
COMMENT ON FUNCTION dismiss_warning(UUID, UUID, TEXT) IS 'Marks a warning as dismissed by the user'; 