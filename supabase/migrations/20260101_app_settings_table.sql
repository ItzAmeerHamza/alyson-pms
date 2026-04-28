-- Migration: Create app_settings table for centralized application configuration
-- This replaces localStorage-based settings with database storage

-- Create app_settings table
CREATE TABLE IF NOT EXISTS public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Allow admins to read all settings
DROP POLICY IF EXISTS "Admins can read settings" ON public.app_settings;
CREATE POLICY "Admins can read settings"
  ON public.app_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- Allow admins to insert settings
DROP POLICY IF EXISTS "Admins can insert settings" ON public.app_settings;
CREATE POLICY "Admins can insert settings"
  ON public.app_settings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- Allow admins to update settings
DROP POLICY IF EXISTS "Admins can update settings" ON public.app_settings;
CREATE POLICY "Admins can update settings"
  ON public.app_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- Create function to update timestamp
CREATE OR REPLACE FUNCTION update_app_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS app_settings_updated_at ON public.app_settings;
CREATE TRIGGER app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_app_settings_timestamp();

-- Insert default settings
INSERT INTO public.app_settings (key, value, description)
VALUES (
  'global',
  '{
    "screenshot_interval": 300,
    "blur_screenshots": false,
    "idle_threshold": 300,
    "track_urls": true,
    "track_applications": true,
    "notification_frequency": 3600,
    "auto_start_tracking": false,
    "require_task_selection": true,
    "max_idle_time": 900,
    "screenshot_quality": 80,
    "working_hours_start": "09:00",
    "working_hours_end": "17:00",
    "timezone": "UTC",
    "company_name": "Your Company",
    "admin_email": "admin@company.com"
  }'::jsonb,
  'Global application settings for time tracking configuration'
)
ON CONFLICT (key) DO NOTHING;

-- Grant access to authenticated users
GRANT SELECT ON public.app_settings TO authenticated;
GRANT INSERT, UPDATE ON public.app_settings TO authenticated;

-- Add comment
COMMENT ON TABLE public.app_settings IS 'Centralized application settings storage';




