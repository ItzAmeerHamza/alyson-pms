-- Create activities table for storing user input activities
-- This table tracks mouse clicks, keystrokes, and mouse movements

CREATE TABLE IF NOT EXISTS activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID,
    time_log_id UUID,
    activity_type VARCHAR(50) NOT NULL, -- 'mouse_click', 'keystroke', 'mouse_move'
    x_position INTEGER,
    y_position INTEGER,
    key_pressed VARCHAR(10),
    distance FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS activities_user_id_idx ON activities(user_id);
CREATE INDEX IF NOT EXISTS activities_created_at_idx ON activities(created_at);
CREATE INDEX IF NOT EXISTS activities_activity_type_idx ON activities(activity_type);
CREATE INDEX IF NOT EXISTS activities_time_log_id_idx ON activities(time_log_id);

-- Enable RLS
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
DROP POLICY IF EXISTS "Users can view own activities" ON activities;
CREATE POLICY "Users can view own activities" ON activities
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own activities" ON activities;
CREATE POLICY "Users can insert own activities" ON activities
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage activities" ON activities;
CREATE POLICY "Service role can manage activities" ON activities
    FOR ALL USING (true);

-- Add helpful comment
COMMENT ON TABLE activities IS 'Stores user input activities including mouse clicks, keystrokes, and mouse movements for time tracking'; 