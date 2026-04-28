-- Migration: Admin Alerts and AI Enhancements
-- Description: Create admin_alerts table for real-time AI-powered alerts
--              Add AI analysis columns to screenshots table
--              Create ai_user_patterns table for behavioral learning

-- ============================================
-- 1. Create admin_alerts table
-- ============================================

CREATE TABLE IF NOT EXISTS public.admin_alerts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- User and screenshot references
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    screenshot_id UUID REFERENCES public.screenshots(id) ON DELETE SET NULL,
    
    -- Alert classification
    alert_type TEXT NOT NULL CHECK (alert_type IN (
        'non_work_activity',
        'extended_idle', 
        'consecutive_duplicates',
        'potential_fraud',
        'privacy_concern',
        'unusual_hours',
        'productivity_drop',
        'suspicious_pattern'
    )),
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    category TEXT CHECK (category IN (
        'productive',
        'social_media',
        'entertainment',
        'gaming',
        'shopping',
        'communication',
        'other'
    )),
    
    -- Alert content
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    
    -- AI analysis data
    ai_confidence NUMERIC(5,4) CHECK (ai_confidence >= 0 AND ai_confidence <= 1),
    ai_reasoning TEXT,
    vision_analysis JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    
    -- Alert management
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by UUID REFERENCES public.users(id),
    acknowledged_at TIMESTAMPTZ,
    is_false_positive BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for admin_alerts
CREATE INDEX IF NOT EXISTS idx_admin_alerts_user_id ON public.admin_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_alerts_severity ON public.admin_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_admin_alerts_type ON public.admin_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_admin_alerts_unacknowledged ON public.admin_alerts(acknowledged, created_at DESC) 
    WHERE acknowledged = FALSE;
CREATE INDEX IF NOT EXISTS idx_admin_alerts_created_at ON public.admin_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_alerts_screenshot ON public.admin_alerts(screenshot_id) 
    WHERE screenshot_id IS NOT NULL;

-- Enable RLS on admin_alerts
ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for admin_alerts
DROP POLICY IF EXISTS "Admins can view all alerts" ON public.admin_alerts;
CREATE POLICY "Admins can view all alerts" ON public.admin_alerts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid()::uuid 
            AND users.role IN ('admin', 'manager')
        )
    );

DROP POLICY IF EXISTS "Admins can update alerts" ON public.admin_alerts;
CREATE POLICY "Admins can update alerts" ON public.admin_alerts
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid()::uuid 
            AND users.role IN ('admin', 'manager')
        )
    );

DROP POLICY IF EXISTS "Service role can manage alerts" ON public.admin_alerts;
CREATE POLICY "Service role can manage alerts" ON public.admin_alerts
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Enable realtime for admin_alerts
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_alerts;

-- ============================================
-- 2. Add AI columns to screenshots table
-- ============================================

-- Duplicate detection flag (required by trigger/function below)
DO $$ BEGIN
    ALTER TABLE public.screenshots ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Vision analysis result from AI
DO $$ BEGIN
    ALTER TABLE public.screenshots ADD COLUMN IF NOT EXISTS vision_analysis JSONB;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Consecutive duplicate tracking
DO $$ BEGIN
    ALTER TABLE public.screenshots ADD COLUMN IF NOT EXISTS consecutive_duplicate_count INTEGER DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Link to alert if one was created for this screenshot
DO $$ BEGIN
    ALTER TABLE public.screenshots ADD COLUMN IF NOT EXISTS alert_id UUID REFERENCES public.admin_alerts(id);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- AI model used for analysis
DO $$ BEGIN
    ALTER TABLE public.screenshots ADD COLUMN IF NOT EXISTS ai_model_used TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Vision-detected content description
DO $$ BEGIN
    ALTER TABLE public.screenshots ADD COLUMN IF NOT EXISTS vision_content TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Work-related flag from AI
DO $$ BEGIN
    ALTER TABLE public.screenshots ADD COLUMN IF NOT EXISTS is_work_related BOOLEAN;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Create index for screenshots with alerts
CREATE INDEX IF NOT EXISTS idx_screenshots_alert_id ON public.screenshots(alert_id) 
    WHERE alert_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_screenshots_consecutive_dup ON public.screenshots(consecutive_duplicate_count) 
    WHERE consecutive_duplicate_count > 0;

CREATE INDEX IF NOT EXISTS idx_screenshots_work_related ON public.screenshots(is_work_related);

-- ============================================
-- 3. Create ai_user_patterns table for behavioral learning
-- ============================================

CREATE TABLE IF NOT EXISTS public.ai_user_patterns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
    
    -- Work schedule patterns
    typical_work_hours JSONB DEFAULT '{"start": 9, "end": 18, "days": [1,2,3,4,5]}',
    
    -- Common applications and sites
    common_apps JSONB DEFAULT '[]',
    common_sites JSONB DEFAULT '[]',
    
    -- Productivity patterns by hour (0-23)
    productivity_by_hour JSONB DEFAULT '{}',
    
    -- Activity level patterns
    avg_activity_percent NUMERIC(5,2) DEFAULT 50,
    avg_screenshots_per_day INTEGER DEFAULT 0,
    
    -- Break patterns
    typical_break_duration_minutes INTEGER DEFAULT 15,
    typical_breaks_per_day INTEGER DEFAULT 4,
    
    -- Learning metadata
    data_points_analyzed INTEGER DEFAULT 0,
    last_pattern_update TIMESTAMPTZ DEFAULT NOW(),
    pattern_confidence NUMERIC(5,4) DEFAULT 0.5,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for ai_user_patterns
CREATE INDEX IF NOT EXISTS idx_ai_user_patterns_user ON public.ai_user_patterns(user_id);

-- Enable RLS
ALTER TABLE public.ai_user_patterns ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Admins can view patterns" ON public.ai_user_patterns;
CREATE POLICY "Admins can view patterns" ON public.ai_user_patterns
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid()::uuid 
            AND users.role IN ('admin', 'manager')
        )
        OR user_id = auth.uid()::uuid
    );

DROP POLICY IF EXISTS "Service role can manage patterns" ON public.ai_user_patterns;
CREATE POLICY "Service role can manage patterns" ON public.ai_user_patterns
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- 4. Create view for alert summary
-- ============================================

CREATE OR REPLACE VIEW public.alert_summary AS
SELECT 
    user_id,
    COUNT(*) FILTER (WHERE NOT acknowledged) as unacknowledged_count,
    COUNT(*) FILTER (WHERE severity = 'critical' AND NOT acknowledged) as critical_count,
    COUNT(*) FILTER (WHERE severity = 'high' AND NOT acknowledged) as high_count,
    COUNT(*) FILTER (WHERE severity = 'medium' AND NOT acknowledged) as medium_count,
    COUNT(*) FILTER (WHERE severity = 'low' AND NOT acknowledged) as low_count,
    COUNT(*) FILTER (WHERE is_false_positive) as false_positive_count,
    MAX(created_at) as latest_alert_at
FROM public.admin_alerts
GROUP BY user_id;

-- Grant access to view
GRANT SELECT ON public.alert_summary TO authenticated;
GRANT SELECT ON public.alert_summary TO service_role;

-- ============================================
-- 5. Function to update consecutive duplicate count
-- ============================================

CREATE OR REPLACE FUNCTION update_consecutive_duplicate_count()
RETURNS TRIGGER AS $$
BEGIN
    -- If this screenshot is marked as duplicate, check previous
    IF NEW.is_duplicate = TRUE THEN
        -- Get the previous screenshot's consecutive count
        SELECT COALESCE(consecutive_duplicate_count, 0) + 1
        INTO NEW.consecutive_duplicate_count
        FROM public.screenshots
        WHERE user_id = NEW.user_id
          AND id != NEW.id
          AND captured_at < NEW.captured_at
        ORDER BY captured_at DESC
        LIMIT 1;
        
        -- Default to 1 if no previous screenshot
        IF NEW.consecutive_duplicate_count IS NULL THEN
            NEW.consecutive_duplicate_count := 1;
        END IF;
    ELSE
        NEW.consecutive_duplicate_count := 0;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for consecutive duplicate tracking
DROP TRIGGER IF EXISTS trigger_update_consecutive_dup ON public.screenshots;
CREATE TRIGGER trigger_update_consecutive_dup
    BEFORE INSERT OR UPDATE OF is_duplicate ON public.screenshots
    FOR EACH ROW
    EXECUTE FUNCTION update_consecutive_duplicate_count();

-- ============================================
-- 6. Add comments for documentation
-- ============================================

COMMENT ON TABLE public.admin_alerts IS 'Real-time alerts for admin dashboard generated by AI analysis';
COMMENT ON COLUMN public.admin_alerts.alert_type IS 'Type of alert: non_work_activity, extended_idle, consecutive_duplicates, potential_fraud, privacy_concern, unusual_hours, productivity_drop, suspicious_pattern';
COMMENT ON COLUMN public.admin_alerts.severity IS 'Alert severity: low, medium, high, critical';
COMMENT ON COLUMN public.admin_alerts.vision_analysis IS 'JSON result from vision AI model analysis of screenshot';
COMMENT ON COLUMN public.admin_alerts.ai_confidence IS 'AI model confidence score (0-1)';

COMMENT ON TABLE public.ai_user_patterns IS 'Learned behavioral patterns for each user to detect anomalies';
COMMENT ON COLUMN public.ai_user_patterns.typical_work_hours IS 'JSON with start, end hours and working days';
COMMENT ON COLUMN public.ai_user_patterns.productivity_by_hour IS 'JSON mapping hour (0-23) to average productivity score';

COMMENT ON COLUMN public.screenshots.vision_analysis IS 'AI vision model analysis of screenshot content';
COMMENT ON COLUMN public.screenshots.consecutive_duplicate_count IS 'Number of consecutive duplicate screenshots including this one';
COMMENT ON COLUMN public.screenshots.is_work_related IS 'AI determination if screenshot shows work-related activity';



