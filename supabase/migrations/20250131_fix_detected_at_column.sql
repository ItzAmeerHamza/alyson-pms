-- Fix missing detected_at column in app_logs table
-- This column is used by the smart activity monitoring system

-- Add detected_at column to app_logs table
ALTER TABLE public.app_logs ADD COLUMN IF NOT EXISTS detected_at BIGINT;

-- Add index for performance on the new column
CREATE INDEX IF NOT EXISTS idx_app_logs_detected_at ON public.app_logs(detected_at);

-- Add project_id column for better tracking (used by activity monitor)
ALTER TABLE public.app_logs ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

-- Add index for project_id
CREATE INDEX IF NOT EXISTS idx_app_logs_project_id ON public.app_logs(project_id);

-- Comment explaining the column
COMMENT ON COLUMN public.app_logs.detected_at IS 'Timestamp in milliseconds when the app was detected (for local tracking)';
COMMENT ON COLUMN public.app_logs.project_id IS 'Project associated with this app log entry'; 