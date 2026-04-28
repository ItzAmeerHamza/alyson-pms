-- Employee Status Change Notifications
-- This migration sets up automated email notifications for employee status changes

-- Function to send employee status change notification
CREATE OR REPLACE FUNCTION notify_employee_status_change()
RETURNS TRIGGER AS $$
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
    'timestamp', NOW()::text
  );
  
  -- Send notification via HTTP request to edge function
  PERFORM
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/employee-notifications/employee-status-change',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := notification_payload
    );
  
  -- Log the notification attempt
  INSERT INTO public.notification_log (
    notification_type,
    recipient_type,
    payload,
    status,
    created_at
  ) VALUES (
    'employee_status_change',
    'hr_admin',
    notification_payload,
    'sent',
    NOW()
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to handle new employee welcome notifications
CREATE OR REPLACE FUNCTION notify_new_employee_welcome()
RETURNS TRIGGER AS $$
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
    'employee_name', COALESCE(NEW.full_name, NEW.email)
  );
  
  -- Send welcome notification via HTTP request to edge function
  PERFORM
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/employee-notifications/new-employee-welcome',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := notification_payload
    );
  
  -- Log the notification attempt
  INSERT INTO public.notification_log (
    notification_type,
    recipient_type,
    payload,
    status,
    created_at
  ) VALUES (
    'new_employee_welcome',
    'hr_admin',
    notification_payload,
    'sent',
    NOW()
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create notification log table to track sent notifications
CREATE TABLE IF NOT EXISTS public.notification_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_type TEXT NOT NULL,
  recipient_type TEXT NOT NULL,
  recipient_id UUID REFERENCES public.users(id), -- Optional specific recipient
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'retry')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for notification log
CREATE INDEX IF NOT EXISTS idx_notification_log_type ON public.notification_log(notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_log_status ON public.notification_log(status);
CREATE INDEX IF NOT EXISTS idx_notification_log_created_at ON public.notification_log(created_at);

-- Enable RLS on notification log
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

-- RLS policy for notification log - only admins can see
CREATE POLICY "Admins can manage notification log" ON public.notification_log
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'manager')
    )
  );

-- Create triggers for employee status changes
DROP TRIGGER IF EXISTS employee_status_change_notification ON public.users;
CREATE TRIGGER employee_status_change_notification
  AFTER UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION notify_employee_status_change();

-- Create trigger for new employee welcome
DROP TRIGGER IF EXISTS new_employee_welcome_notification ON public.users;
CREATE TRIGGER new_employee_welcome_notification
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_employee_welcome();

-- Function to manually trigger notifications (for testing)
CREATE OR REPLACE FUNCTION trigger_employee_notification(
  employee_id UUID,
  change_type TEXT DEFAULT 'joined'
) RETURNS BOOLEAN AS $$
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
    'timestamp', NOW()::text
  );
  
  -- Send notification
  PERFORM
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/employee-notifications/employee-status-change',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := notification_payload
    );
  
  -- Log the notification
  INSERT INTO public.notification_log (
    notification_type,
    recipient_type,
    payload,
    status,
    created_at
  ) VALUES (
    'manual_employee_notification',
    'hr_admin',
    notification_payload,
    'sent',
    NOW()
  );
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION notify_employee_status_change TO authenticated;
GRANT EXECUTE ON FUNCTION notify_new_employee_welcome TO authenticated;
GRANT EXECUTE ON FUNCTION trigger_employee_notification TO authenticated;

-- Create updated_at trigger for notification_log
CREATE TRIGGER update_notification_log_updated_at
    BEFORE UPDATE ON public.notification_log
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON FUNCTION notify_employee_status_change() IS 'Automatically sends email notifications when employee status changes';
COMMENT ON FUNCTION notify_new_employee_welcome() IS 'Sends welcome email notifications for new employees';
COMMENT ON FUNCTION trigger_employee_notification(UUID, TEXT) IS 'Manually trigger employee notifications for testing';
COMMENT ON TABLE public.notification_log IS 'Logs all notification attempts for audit and debugging';

-- Set up configuration for the notification system
-- These need to be set in the Supabase dashboard or via SQL:
-- ALTER DATABASE postgres SET app.settings.supabase_url = 'https://your-project.supabase.co';
-- ALTER DATABASE postgres SET app.settings.service_role_key = 'your-service-role-key';

-- Insert initial configuration if it doesn't exist
DO $$
BEGIN
  -- You can set these values in the Supabase dashboard under Settings > Database > Custom settings
  -- Or uncomment and modify the lines below with your actual values:
  
  -- PERFORM set_config('app.settings.supabase_url', 'https://your-project.supabase.co', false);
  -- PERFORM set_config('app.settings.service_role_key', 'your-service-role-key', false);
  
  -- For now, we'll use environment variables that should be available in the edge functions
  NULL;
END $$; 