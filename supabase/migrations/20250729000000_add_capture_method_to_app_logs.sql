-- Add capture_method column to app_logs table
-- This fixes the schema issue causing app logs sync failures

ALTER TABLE app_logs 
ADD COLUMN IF NOT EXISTS capture_method TEXT DEFAULT 'realtime';

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_app_logs_capture_method ON app_logs(capture_method);

-- Update any existing records to have the default capture_method
UPDATE app_logs 
SET capture_method = 'realtime' 
WHERE capture_method IS NULL; 