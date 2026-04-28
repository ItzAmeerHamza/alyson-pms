-- Create system_checks table for storing system check test data
CREATE TABLE IF NOT EXISTS system_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_type VARCHAR(50) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_agent TEXT,
    test_data JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'pending',
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_system_checks_timestamp ON system_checks(timestamp);
CREATE INDEX IF NOT EXISTS idx_system_checks_type ON system_checks(check_type);
CREATE INDEX IF NOT EXISTS idx_system_checks_status ON system_checks(status);

-- Add RLS policies
ALTER TABLE system_checks ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert and read their own system checks
CREATE POLICY "Users can insert system checks" ON system_checks
    FOR INSERT 
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can read system checks" ON system_checks
    FOR SELECT 
    USING (auth.role() = 'authenticated');

-- Allow system to update system checks
CREATE POLICY "System can update system checks" ON system_checks
    FOR UPDATE 
    USING (auth.role() = 'authenticated');

-- Add comment
COMMENT ON TABLE system_checks IS 'Stores system check test data and results for debugging and validation'; 