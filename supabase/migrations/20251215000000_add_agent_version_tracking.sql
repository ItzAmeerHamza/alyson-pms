-- Migration: Add agent version tracking to app_logs and screenshots
-- Purpose: Track which desktop agent version users are running
-- Backward compatible: Nullable columns allow old agents to continue working

-- Add agent_version column to app_logs table
ALTER TABLE app_logs
ADD COLUMN IF NOT EXISTS agent_version TEXT NULL;

-- Add agent_version column to screenshots table
ALTER TABLE screenshots
ADD COLUMN IF NOT EXISTS agent_version TEXT NULL;

-- Add comment for documentation
COMMENT ON COLUMN app_logs.agent_version IS 'Desktop agent version that logged this app (e.g., 1.0.124). NULL for legacy agents (<1.0.124)';
COMMENT ON COLUMN screenshots.agent_version IS 'Desktop agent version that captured this screenshot (e.g., 1.0.124). NULL for legacy agents (<1.0.124)';

-- Create index for efficient querying of agent versions by user
CREATE INDEX IF NOT EXISTS idx_app_logs_user_agent_version 
ON app_logs(user_id, agent_version) 
WHERE agent_version IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_screenshots_user_agent_version 
ON screenshots(user_id, agent_version) 
WHERE agent_version IS NOT NULL;

-- Create view for latest agent version per user
CREATE OR REPLACE VIEW user_agent_versions AS
SELECT DISTINCT ON (user_id)
  user_id,
  agent_version,
  created_at as last_seen
FROM app_logs
WHERE agent_version IS NOT NULL
ORDER BY user_id, created_at DESC;

COMMENT ON VIEW user_agent_versions IS 'Shows the latest agent version used by each user based on app_logs';















