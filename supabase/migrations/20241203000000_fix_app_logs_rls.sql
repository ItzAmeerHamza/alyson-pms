
-- Fix RLS policies for app_logs table
-- This migration fixes the permission issues preventing app logs from being saved

-- Enable RLS on app_logs if not already enabled
ALTER TABLE app_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own app logs" ON app_logs;
DROP POLICY IF EXISTS "Users can insert own app logs" ON app_logs;
DROP POLICY IF EXISTS "Admins can view all app logs" ON app_logs;

-- Create new policies for app_logs
CREATE POLICY "Users can view own app logs" ON app_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own app logs" ON app_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own app logs" ON app_logs
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all app logs" ON app_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "Admins can manage all app logs" ON app_logs
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'manager')
        )
    );

-- Also fix screenshots table RLS if needed
ALTER TABLE screenshots ENABLE ROW LEVEL SECURITY;

-- Drop existing screenshot policies if they exist
DROP POLICY IF EXISTS "Users can view own screenshots" ON screenshots;
DROP POLICY IF EXISTS "Users can insert own screenshots" ON screenshots;
DROP POLICY IF EXISTS "Admins can view all screenshots" ON screenshots;

-- Create new policies for screenshots
CREATE POLICY "Users can view own screenshots" ON screenshots
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own screenshots" ON screenshots
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own screenshots" ON screenshots
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all screenshots" ON screenshots
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "Admins can manage all screenshots" ON screenshots
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'manager')
        )
    );

-- Fix time_logs table RLS as well
ALTER TABLE time_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing time_logs policies if they exist
DROP POLICY IF EXISTS "Users can view own time logs" ON time_logs;
DROP POLICY IF EXISTS "Users can insert own time logs" ON time_logs;
DROP POLICY IF EXISTS "Admins can view all time logs" ON time_logs;

-- Create new policies for time_logs
CREATE POLICY "Users can view own time logs" ON time_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own time logs" ON time_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own time logs" ON time_logs
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all time logs" ON time_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "Admins can manage all time logs" ON time_logs
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'manager')
        )
    );

-- Create a service role policy for the desktop agent
-- This allows the desktop agent to insert data using the service role key
CREATE POLICY "Service role can manage app logs" ON app_logs
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage screenshots" ON screenshots
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage time logs" ON time_logs
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage url logs" ON url_logs
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage idle logs" ON idle_logs
    FOR ALL USING (auth.role() = 'service_role');

COMMENT ON POLICY "Service role can manage app logs" ON app_logs IS 'Allows desktop agent to insert app logs using service role';
COMMENT ON POLICY "Service role can manage screenshots" ON screenshots IS 'Allows desktop agent to insert screenshots using service role';
COMMENT ON POLICY "Service role can manage time logs" ON time_logs IS 'Allows desktop agent to insert time logs using service role';
