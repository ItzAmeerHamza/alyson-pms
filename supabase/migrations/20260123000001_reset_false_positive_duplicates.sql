-- Reset false positive duplicates for re-validation with stricter thresholds
-- The duplicate detection thresholds were too loose (Hamming distance 6), causing
-- different screenshots with similar layouts to be incorrectly marked as duplicates.
-- New thresholds: NEAR_DUPLICATE=2, SIMILAR_CONTENT=3

-- Table used by vision-validator edge function and admin metrics (was missing from migrations)
CREATE TABLE IF NOT EXISTS public.vision_analysis_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    validator_run_id TEXT NOT NULL,
    execution_duration_ms INTEGER,
    screenshots_processed INTEGER,
    screenshots_failed INTEGER,
    api_calls_made INTEGER,
    duplicates_confirmed INTEGER,
    duplicates_rejected INTEGER,
    status TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    api_errors TEXT[],
    api_rate_limit_remaining INTEGER,
    api_rate_limit_reset_at TIMESTAMPTZ,
    error_message TEXT,
    false_positives_caught INTEGER,
    metadata JSONB,
    privacy_alerts_created INTEGER,
    total_screenshots_flagged INTEGER,
    vision_validation_rate DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS idx_vision_analysis_metrics_created_at
    ON public.vision_analysis_metrics (created_at DESC);

ALTER TABLE public.vision_analysis_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can view vision analysis metrics" ON public.vision_analysis_metrics;
DROP POLICY IF EXISTS "Service role can manage vision analysis metrics" ON public.vision_analysis_metrics;

CREATE POLICY "Admin can view vision analysis metrics" ON public.vision_analysis_metrics
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid()
              AND u.role = 'admin'
        )
    );

CREATE POLICY "Service role can manage vision analysis metrics" ON public.vision_analysis_metrics
    FOR ALL USING (auth.role() = 'service_role');

-- Step 1: Clear duplicate status for all recently marked duplicates (last 7 days)
-- These will be re-validated by the vision-validator with stricter thresholds
UPDATE public.screenshots
SET 
    is_duplicate = false,
    duplicate_reason = 'Reset for re-validation with stricter thresholds',
    duplicate_group_hash = NULL,
    duplicate_matched_id = NULL,
    needs_vision_validation = true,
    vision_validated_at = NULL
WHERE 
    is_duplicate = true
    AND captured_at >= NOW() - INTERVAL '7 days';

-- Step 2: Log the reset for audit purposes
INSERT INTO public.vision_analysis_metrics (
    validator_run_id,
    execution_duration_ms,
    screenshots_processed,
    screenshots_failed,
    api_calls_made,
    duplicates_confirmed,
    duplicates_rejected,
    status
)
SELECT 
    'migration_reset_' || to_char(NOW(), 'YYYYMMDDHH24MISS'),
    0,
    COUNT(*),
    0,
    0,
    0,
    COUNT(*),  -- All are being rejected/reset
    'migration_reset'
FROM public.screenshots
WHERE 
    duplicate_reason = 'Reset for re-validation with stricter thresholds';

-- Step 3: Add comment documenting the threshold change
COMMENT ON COLUMN public.screenshots.is_duplicate IS 
    'Indicates duplicate screenshot. Detection thresholds (Jan 2026): EXACT=0, NEAR=2, SIMILAR=3 Hamming distance. Context (app/window) must also match for SIMILAR threshold.';
