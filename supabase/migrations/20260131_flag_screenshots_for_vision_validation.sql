-- ============================================================
-- FLAG SCREENSHOTS FOR VISION VALIDATION
-- ============================================================
-- Problem: Screenshots were being uploaded without needs_vision_validation=true
-- so Vision Validator never processed them for duplicate detection.
--
-- This migration:
-- 1. Sets needs_vision_validation=true for recent unvalidated screenshots
-- 2. Adds a DEFAULT value so all new screenshots are flagged automatically
-- ============================================================

-- ============================================================
-- STEP 1: Flag existing screenshots from last 7 days for validation
-- ============================================================
-- Only flag screenshots that:
-- - Have a perceptual_hash (required for duplicate detection)
-- - Haven't been validated yet
-- - Aren't already flagged

UPDATE screenshots
SET needs_vision_validation = true
WHERE captured_at > NOW() - INTERVAL '7 days'
  AND vision_validated_at IS NULL
  AND perceptual_hash IS NOT NULL
  AND (needs_vision_validation IS NULL OR needs_vision_validation = false);

-- ============================================================
-- STEP 2: Set DEFAULT value for needs_vision_validation column
-- ============================================================
-- This ensures ALL new screenshots are automatically flagged for validation

ALTER TABLE screenshots 
ALTER COLUMN needs_vision_validation SET DEFAULT true;

-- ============================================================
-- STEP 3: Add comment explaining the column
-- ============================================================

COMMENT ON COLUMN screenshots.needs_vision_validation IS 
'Flag indicating screenshot needs Vision Validator processing. 
Defaults to TRUE so all new screenshots are automatically processed for:
- Duplicate detection via perceptual hash comparison
- AI content categorization (productive/social_media/entertainment/gaming)
- Idle state inference
Set to FALSE after Vision Validator processes the screenshot.';

-- Log how many screenshots were flagged
DO $$
DECLARE
  flagged_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO flagged_count
  FROM screenshots
  WHERE captured_at > NOW() - INTERVAL '7 days'
    AND needs_vision_validation = true
    AND vision_validated_at IS NULL;
  
  RAISE NOTICE 'Flagged % screenshots for vision validation', flagged_count;
END $$;
