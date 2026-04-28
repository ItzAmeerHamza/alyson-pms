-- Fix naming inconsistency: Rename org_id to organization_id in app_url_activity
-- This standardizes the column naming across all tables

-- Rename the column
ALTER TABLE public.app_url_activity
RENAME COLUMN org_id TO organization_id;

-- Drop old index if it exists
DROP INDEX IF EXISTS idx_app_url_activity_org_id;

-- Create new index with correct naming
CREATE INDEX IF NOT EXISTS idx_app_url_activity_organization_id 
ON public.app_url_activity(organization_id);

-- Add comment
COMMENT ON COLUMN public.app_url_activity.organization_id IS 'Organization this URL activity belongs to';
