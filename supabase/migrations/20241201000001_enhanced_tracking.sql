-- Enhanced tracking tables for Hubstaff-like functionality

-- URL logs table for tracking browser activity
CREATE TABLE IF NOT EXISTS url_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    time_log_id UUID REFERENCES time_logs(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT,
    domain TEXT,
    browser TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Idle logs table for tracking idle periods
CREATE TABLE IF NOT EXISTS idle_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    time_log_id UUID REFERENCES time_logs(id) ON DELETE CASCADE,
    idle_start TIMESTAMPTZ NOT NULL,
    idle_end TIMESTAMPTZ NOT NULL,
    duration_seconds INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enhanced app_logs table with more fields
ALTER TABLE app_logs ADD COLUMN IF NOT EXISTS app_path TEXT;
ALTER TABLE app_logs ADD COLUMN IF NOT EXISTS window_title TEXT;

-- Enhanced time_logs table with idle tracking
ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS is_idle BOOLEAN DEFAULT FALSE;
ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS idle_seconds INTEGER DEFAULT 0;

-- Enhanced screenshots table with activity metrics
ALTER TABLE screenshots ADD COLUMN IF NOT EXISTS activity_percent INTEGER DEFAULT 0;
ALTER TABLE screenshots ADD COLUMN IF NOT EXISTS focus_percent INTEGER DEFAULT 0;
ALTER TABLE screenshots ADD COLUMN IF NOT EXISTS mouse_clicks INTEGER DEFAULT 0;
ALTER TABLE screenshots ADD COLUMN IF NOT EXISTS keystrokes INTEGER DEFAULT 0;
ALTER TABLE screenshots ADD COLUMN IF NOT EXISTS mouse_movements INTEGER DEFAULT 0;
ALTER TABLE screenshots ADD COLUMN IF NOT EXISTS is_blurred BOOLEAN DEFAULT FALSE;

-- Notifications table for real-time alerts
CREATE TABLE IF NOT EXISTS notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'info', -- info, warning, error, success
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- App usage analytics view
CREATE OR REPLACE VIEW app_usage_analytics AS
SELECT 
    al.user_id,
    al.app_name,
    COUNT(*) as usage_count,
    DATE_TRUNC('day', al.timestamp) as usage_date,
    EXTRACT(HOUR FROM al.timestamp) as usage_hour,
    COUNT(DISTINCT al.time_log_id) as sessions_count
FROM app_logs al
GROUP BY al.user_id, al.app_name, DATE_TRUNC('day', al.timestamp), EXTRACT(HOUR FROM al.timestamp);

-- URL usage analytics view
CREATE OR REPLACE VIEW url_usage_analytics AS
SELECT 
    ul.user_id,
    ul.domain,
    COUNT(*) as visit_count,
    DATE_TRUNC('day', ul.timestamp) as visit_date,
    EXTRACT(HOUR FROM ul.timestamp) as visit_hour,
    COUNT(DISTINCT ul.time_log_id) as sessions_count
FROM url_logs ul
GROUP BY ul.user_id, ul.domain, DATE_TRUNC('day', ul.timestamp), EXTRACT(HOUR FROM ul.timestamp);

-- Idle time analytics view
CREATE OR REPLACE VIEW idle_analytics AS
SELECT 
    il.user_id,
    DATE_TRUNC('day', il.idle_start) as idle_date,
    SUM(il.duration_seconds) as total_idle_seconds,
    COUNT(*) as idle_periods_count,
    AVG(il.duration_seconds) as avg_idle_duration,
    MAX(il.duration_seconds) as max_idle_duration
FROM idle_logs il
GROUP BY il.user_id, DATE_TRUNC('day', il.idle_start);

-- Activity summary view
CREATE OR REPLACE VIEW daily_activity_summary AS
SELECT 
    tl.user_id,
    DATE_TRUNC('day', tl.start_time) as activity_date,
    COUNT(*) as sessions_count,
    SUM(EXTRACT(EPOCH FROM (COALESCE(tl.end_time, NOW()) - tl.start_time))) as total_seconds,
    SUM(tl.idle_seconds) as total_idle_seconds,
    AVG(s.activity_percent) as avg_activity_percent,
    AVG(s.focus_percent) as avg_focus_percent,
    COUNT(s.id) as screenshots_count
FROM time_logs tl
LEFT JOIN screenshots s ON s.time_log_id = tl.id
WHERE tl.start_time IS NOT NULL
GROUP BY tl.user_id, DATE_TRUNC('day', tl.start_time);

-- Productivity metrics view
CREATE OR REPLACE VIEW productivity_metrics AS
SELECT 
    u.id as user_id,
    u.email,
    das.activity_date,
    das.total_seconds,
    das.total_idle_seconds,
    das.avg_activity_percent,
    das.avg_focus_percent,
    CASE 
        WHEN das.total_seconds > 0 THEN 
            ROUND(((das.total_seconds - das.total_idle_seconds) / das.total_seconds::NUMERIC) * 100, 2)
        ELSE 0 
    END as productivity_score,
    CASE 
        WHEN das.avg_activity_percent >= 80 AND das.avg_focus_percent >= 80 THEN 'High'
        WHEN das.avg_activity_percent >= 60 AND das.avg_focus_percent >= 60 THEN 'Medium'
        ELSE 'Low'
    END as productivity_level
FROM users u
LEFT JOIN daily_activity_summary das ON das.user_id = u.id
WHERE das.activity_date IS NOT NULL;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_url_logs_user_timestamp ON url_logs(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_url_logs_domain ON url_logs(domain);
CREATE INDEX IF NOT EXISTS idx_idle_logs_user_date ON idle_logs(user_id, idle_start);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_app_logs_app_name ON app_logs(app_name);
CREATE INDEX IF NOT EXISTS idx_time_logs_idle ON time_logs(is_idle);

-- RLS Policies
ALTER TABLE url_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE idle_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- URL logs policies
CREATE POLICY "Users can view own URL logs" ON url_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own URL logs" ON url_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all URL logs" ON url_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'manager')
        )
    );

-- Idle logs policies
CREATE POLICY "Users can view own idle logs" ON idle_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own idle logs" ON idle_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all idle logs" ON idle_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'manager')
        )
    );

-- Notifications policies
CREATE POLICY "Users can view own notifications" ON notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON notifications
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all notifications" ON notifications
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'manager')
        )
    );

-- Function to create notifications
CREATE OR REPLACE FUNCTION create_notification(
    target_user_id UUID,
    notification_type TEXT,
    notification_title TEXT,
    notification_message TEXT
) RETURNS UUID AS $$
DECLARE
    notification_id UUID;
BEGIN
    INSERT INTO notifications (user_id, type, title, message)
    VALUES (target_user_id, notification_type, notification_title, notification_message)
    RETURNING id INTO notification_id;
    
    RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get app settings (for desktop agent)
CREATE OR REPLACE FUNCTION get_app_settings()
RETURNS JSON AS $$
BEGIN
    -- Return default settings - in production, this would come from a settings table
    RETURN json_build_object(
        'screenshot_interval', 300,
        'idle_threshold', 300,
        'blur_screenshots', false,
        'track_urls', true,
        'track_applications', true,
        'auto_start_tracking', false,
        'max_idle_time', 2400,
        'screenshot_quality', 80,
        'notification_frequency', 120
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_notifications_updated_at
    BEFORE UPDATE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE url_logs IS 'Tracks browser URL visits for productivity analysis';
COMMENT ON TABLE idle_logs IS 'Tracks idle periods for accurate time logging';
COMMENT ON TABLE notifications IS 'System notifications for users';
COMMENT ON VIEW app_usage_analytics IS 'Analytics view for application usage patterns';
COMMENT ON VIEW url_usage_analytics IS 'Analytics view for website usage patterns';
COMMENT ON VIEW idle_analytics IS 'Analytics view for idle time patterns';
COMMENT ON VIEW daily_activity_summary IS 'Daily summary of user activity metrics';
COMMENT ON VIEW productivity_metrics IS 'Comprehensive productivity scoring and metrics'; 