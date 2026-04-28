-- ============================================================
-- FIX DUPLICATE DETECTION - Add tracking column and clear false positives
-- ============================================================
-- This migration:
-- 1. Adds duplicate_matched_id column to track which screenshot was matched
-- 2. Clears false positive duplicates (screenshots with high activity)
-- ============================================================

-- ============================================================
-- STEP 1: Add duplicate_matched_id column for debugging
-- ============================================================
-- This column tracks which screenshot the current one was compared against
-- Useful for debugging and understanding duplicate groupings

ALTER TABLE public.screenshots 
ADD COLUMN IF NOT EXISTS duplicate_matched_id UUID REFERENCES public.screenshots(id);

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_screenshots_duplicate_matched_id 
ON public.screenshots(duplicate_matched_id) 
WHERE duplicate_matched_id IS NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN public.screenshots.duplicate_matched_id IS 
'References the screenshot that this one was detected as a duplicate of. Used for debugging duplicate detection and understanding groupings.';

-- ============================================================
-- STEP 2: Clear FALSE POSITIVE duplicates
-- ============================================================
-- Screenshots with activity > 10% are likely NOT duplicates
-- Real duplicates should have very low activity (user not actively working)

UPDATE public.screenshots
SET 
    is_duplicate = false,
    duplicate_reason = 'Cleared by migration: High activity indicates active work, not duplicate',
    duplicate_group_hash = NULL,
    duplicate_matched_id = NULL
WHERE is_duplicate = true
  AND activity_percent > 10;

-- ============================================================
-- STEP 3: Clear duplicates that don't have proper grouping
-- ============================================================
-- Duplicates without a duplicate_group_hash were likely false positives
-- from the old detection system that compared against a 1-hour window

UPDATE public.screenshots
SET 
    is_duplicate = false,
    duplicate_reason = 'Cleared by migration: No duplicate group hash (legacy detection)',
    duplicate_matched_id = NULL
WHERE is_duplicate = true
  AND duplicate_group_hash IS NULL;

-- ============================================================
-- STEP 4: Log the migration
-- ============================================================
DO $$
DECLARE
    cleared_high_activity INTEGER;
    cleared_no_hash INTEGER;
BEGIN
    -- Get counts for logging
    SELECT COUNT(*) INTO cleared_high_activity
    FROM public.screenshots 
    WHERE duplicate_reason LIKE '%High activity indicates active work%';
    
    SELECT COUNT(*) INTO cleared_no_hash
    FROM public.screenshots 
    WHERE duplicate_reason LIKE '%No duplicate group hash%';

    INSERT INTO public.system_checks (check_type, test_data, status, completed_at)
    VALUES (
        'duplicate_detection_fix_migration',
        jsonb_build_object(
            'message', 'Fixed duplicate detection false positives',
            'cleared_high_activity', cleared_high_activity,
            'cleared_no_hash', cleared_no_hash,
            'changes', ARRAY[
                'Added duplicate_matched_id column',
                'Cleared duplicates with activity > 10%',
                'Cleared duplicates without group hash',
                'Tightened thresholds in vision-validator (separate deployment)'
            ],
            'migrated_at', NOW()
        ),
        'completed',
        NOW()
    ) ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN
    -- Ignore logging errors
    NULL;
END;
$$;
