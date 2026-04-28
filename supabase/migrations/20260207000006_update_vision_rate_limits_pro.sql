-- ============================================================================
-- Update Vision Rate Limits for Hugging Face Pro Subscription
-- ============================================================================
-- The previous limits (120 hourly / 2000 daily) were set for HF free tier.
-- With a Pro subscription ($9/mo), HF uses pay-as-you-go billing with $2/mo
-- in credits and no strict request count caps. These self-imposed limits are
-- increased to allow higher throughput while still capping runaway costs.
--
-- New limits:
--   Hourly: 120 → 500
--   Daily:  2000 → 10000
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.vision_feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vision_validation_enabled BOOLEAN DEFAULT true,
    max_screenshots_per_run INTEGER DEFAULT 20,
    run_interval_minutes INTEGER DEFAULT 10,
    validate_duplicates BOOLEAN DEFAULT true,
    validate_low_activity BOOLEAN DEFAULT true,
    validate_suspicious BOOLEAN DEFAULT true,
    random_sample_percentage INTEGER DEFAULT 100,
    daily_api_call_limit INTEGER DEFAULT 10000,
    hourly_api_call_limit INTEGER DEFAULT 500,
    backoff_multiplier NUMERIC DEFAULT 2,
    low_activity_threshold INTEGER DEFAULT 10,
    alert_on_rate_limit_percent INTEGER DEFAULT 80,
    alert_on_queue_backlog INTEGER DEFAULT 100,
    alert_on_error_rate_percent INTEGER DEFAULT 10,
    metrics_retention_days INTEGER DEFAULT 30,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES public.users(id),
    reason TEXT
);

ALTER TABLE public.vision_feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can view vision feature flags" ON public.vision_feature_flags;
DROP POLICY IF EXISTS "Service role can manage vision feature flags" ON public.vision_feature_flags;

CREATE POLICY "Admin can view vision feature flags" ON public.vision_feature_flags
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid()
              AND u.role = 'admin'
        )
    );

CREATE POLICY "Service role can manage vision feature flags" ON public.vision_feature_flags
    FOR ALL USING (auth.role() = 'service_role');

-- Update existing feature flags row(s)
UPDATE public.vision_feature_flags
SET
  hourly_api_call_limit = 500,
  daily_api_call_limit  = 10000,
  updated_at            = NOW(),
  reason                = 'Upgraded to Hugging Face Pro subscription – increased rate limits'
WHERE hourly_api_call_limit <= 120
   OR daily_api_call_limit  <= 2000;

-- If no rows existed, insert defaults for Pro tier
INSERT INTO public.vision_feature_flags (
  vision_validation_enabled,
  max_screenshots_per_run,
  hourly_api_call_limit,
  daily_api_call_limit,
  reason
)
SELECT
  true,
  20,
  500,
  10000,
  'Default Pro-tier rate limits'
WHERE NOT EXISTS (SELECT 1 FROM public.vision_feature_flags LIMIT 1);

-- Log migration
INSERT INTO public.system_logs (log_type, message, metadata)
VALUES (
  'migration',
  'Updated vision rate limits for HF Pro subscription',
  jsonb_build_object(
    'migration_file', '20260207_update_vision_rate_limits_pro.sql',
    'old_hourly_limit', 120,
    'new_hourly_limit', 500,
    'old_daily_limit', 2000,
    'new_daily_limit', 10000,
    'timestamp', NOW()
  )
);
