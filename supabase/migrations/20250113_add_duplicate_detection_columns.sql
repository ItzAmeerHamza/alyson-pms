-- Add duplicate detection columns to screenshots table
ALTER TABLE screenshots 
ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS duplicate_reason TEXT,
ADD COLUMN IF NOT EXISTS duplicate_group_hash TEXT,
ADD COLUMN IF NOT EXISTS duplicate_hash TEXT;

-- Create index for efficient duplicate detection queries
CREATE INDEX IF NOT EXISTS idx_screenshots_is_duplicate ON screenshots(is_duplicate) WHERE is_duplicate = TRUE;
CREATE INDEX IF NOT EXISTS idx_screenshots_duplicate_hash ON screenshots(duplicate_hash) WHERE duplicate_hash IS NOT NULL;

-- Update RLS policies to include new columns
-- Allow users to read duplicate information for their own screenshots
DROP POLICY IF EXISTS "Users can view own screenshots" ON screenshots;
CREATE POLICY "Users can view own screenshots" ON screenshots
    FOR SELECT USING (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid()
              AND u.role IN ('admin', 'manager')
        )
    );

-- Allow backend services to update duplicate detection fields
DROP POLICY IF EXISTS "Service role can update screenshots" ON screenshots;
CREATE POLICY "Service role can update screenshots" ON screenshots
    FOR UPDATE USING (auth.role() = 'service_role');

-- Create a view for duplicate screenshot analysis
CREATE OR REPLACE VIEW duplicate_screenshots_summary AS
SELECT 
    user_id,
    DATE(captured_at) as date,
    COUNT(*) as total_duplicates,
    COUNT(DISTINCT duplicate_group_hash) as duplicate_groups,
    AVG(activity_percent) as avg_activity_percent,
    MIN(captured_at) as first_duplicate_at,
    MAX(captured_at) as last_duplicate_at
FROM screenshots 
WHERE is_duplicate = TRUE 
GROUP BY user_id, DATE(captured_at)
ORDER BY date DESC;

-- Grant access to the view
GRANT SELECT ON duplicate_screenshots_summary TO authenticated;
GRANT SELECT ON duplicate_screenshots_summary TO service_role;

-- Add comment explaining the duplicate detection system
COMMENT ON COLUMN screenshots.is_duplicate IS 'Indicates if this screenshot has been identified as a duplicate by the backend analysis system';
COMMENT ON COLUMN screenshots.duplicate_reason IS 'Explanation of why this screenshot was marked as a duplicate';
COMMENT ON COLUMN screenshots.duplicate_group_hash IS 'Hash identifying the group of duplicate screenshots this belongs to';
COMMENT ON COLUMN screenshots.duplicate_hash IS 'Perceptual hash of the image content for similarity comparison'; 