-- Comprehensive Employee Analysis System
-- This migration creates tables for storing AI-powered employee analysis results

-- Main table for comprehensive employee analysis results
CREATE TABLE IF NOT EXISTS public.employee_comprehensive_analysis (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    analysis_date DATE NOT NULL,
    analysis_data JSONB NOT NULL,
    confidence_score INTEGER DEFAULT 0,
    productivity_score INTEGER DEFAULT 0,
    security_risk_level TEXT DEFAULT 'low' CHECK (security_risk_level IN ('low', 'medium', 'high', 'critical')),
    flags_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, analysis_date)
);

-- Table for daily activity summaries (extracted from comprehensive analysis)
CREATE TABLE IF NOT EXISTS public.employee_daily_activities (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    activity_date DATE NOT NULL,
    work_description TEXT,
    productivity_score INTEGER DEFAULT 0,
    main_applications TEXT[],
    websites_visited TEXT[],
    behavioral_notes TEXT,
    focus_time_blocks TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, activity_date)
);

-- Table for behavioral patterns tracking
CREATE TABLE IF NOT EXISTS public.employee_behavioral_patterns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    pattern_date DATE NOT NULL,
    work_style_description TEXT,
    communication_patterns TEXT,
    break_patterns TEXT,
    multitasking_behavior TEXT,
    focus_consistency TEXT,
    stress_indicators TEXT[],
    positive_behaviors TEXT[],
    areas_for_improvement TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, pattern_date)
);

-- Table for management insights and recommendations
CREATE TABLE IF NOT EXISTS public.employee_management_insights (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    insight_date DATE NOT NULL,
    performance_feedback TEXT,
    coaching_opportunities TEXT[],
    workload_adjustments TEXT[],
    skill_development_suggestions TEXT[],
    team_collaboration_insights TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, insight_date)
);

-- Table for tracking analysis requests and performance
CREATE TABLE IF NOT EXISTS public.employee_analysis_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    requested_by UUID REFERENCES public.users(id),
    analysis_period TEXT NOT NULL, -- 'daily', 'weekly', 'monthly'
    analysis_type TEXT DEFAULT 'comprehensive', -- 'comprehensive', 'productivity', 'behavioral', 'security'
    start_date DATE,
    end_date DATE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    data_points_analyzed INTEGER DEFAULT 0,
    processing_time_ms INTEGER,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_employee_comprehensive_analysis_user_date 
    ON public.employee_comprehensive_analysis(user_id, analysis_date DESC);

CREATE INDEX IF NOT EXISTS idx_employee_comprehensive_analysis_productivity 
    ON public.employee_comprehensive_analysis(productivity_score DESC);

CREATE INDEX IF NOT EXISTS idx_employee_comprehensive_analysis_security_risk 
    ON public.employee_comprehensive_analysis(security_risk_level);

CREATE INDEX IF NOT EXISTS idx_employee_daily_activities_user_date 
    ON public.employee_daily_activities(user_id, activity_date DESC);

CREATE INDEX IF NOT EXISTS idx_employee_behavioral_patterns_user_date 
    ON public.employee_behavioral_patterns(user_id, pattern_date DESC);

CREATE INDEX IF NOT EXISTS idx_employee_management_insights_user_date 
    ON public.employee_management_insights(user_id, insight_date DESC);

CREATE INDEX IF NOT EXISTS idx_employee_analysis_requests_status 
    ON public.employee_analysis_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_employee_analysis_requests_user 
    ON public.employee_analysis_requests(user_id, created_at DESC);

-- Row Level Security (RLS) policies
ALTER TABLE public.employee_comprehensive_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_daily_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_behavioral_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_management_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_analysis_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can see all analysis data
CREATE POLICY "Admins can view all employee analysis data" ON public.employee_comprehensive_analysis
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Policy: Managers can see their team's analysis data
CREATE POLICY "Managers can view team analysis data" ON public.employee_comprehensive_analysis
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

-- Policy: Users can see their own analysis data
CREATE POLICY "Users can view own analysis data" ON public.employee_comprehensive_analysis
    FOR SELECT USING (user_id = auth.uid());

-- Similar policies for other tables
CREATE POLICY "Admins can view all daily activities" ON public.employee_daily_activities
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Users can view own daily activities" ON public.employee_daily_activities
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can view all behavioral patterns" ON public.employee_behavioral_patterns
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Users can view own behavioral patterns" ON public.employee_behavioral_patterns
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can view all management insights" ON public.employee_management_insights
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Managers can view team management insights" ON public.employee_management_insights
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "Admins can view all analysis requests" ON public.employee_analysis_requests
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Users can view own analysis requests" ON public.employee_analysis_requests
    FOR SELECT USING (user_id = auth.uid() OR requested_by = auth.uid());

-- Insert policies for creating analysis data (service role only)
CREATE POLICY "Service role can insert analysis data" ON public.employee_comprehensive_analysis
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can update analysis data" ON public.employee_comprehensive_analysis
    FOR UPDATE USING (true);

CREATE POLICY "Service role can insert daily activities" ON public.employee_daily_activities
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can insert behavioral patterns" ON public.employee_behavioral_patterns
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can insert management insights" ON public.employee_management_insights
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can insert analysis requests" ON public.employee_analysis_requests
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can update analysis requests" ON public.employee_analysis_requests
    FOR UPDATE USING (true);

-- Create a view for easy access to latest employee analysis
CREATE OR REPLACE VIEW public.latest_employee_analysis AS
SELECT 
    eca.*,
    u.full_name as employee_name,
    u.email as employee_email,
    u.role as employee_role
FROM public.employee_comprehensive_analysis eca
JOIN public.users u ON eca.user_id = u.id
WHERE eca.analysis_date = (
    SELECT MAX(analysis_date) 
    FROM public.employee_comprehensive_analysis eca2 
    WHERE eca2.user_id = eca.user_id
);

-- Grant permissions
GRANT SELECT ON public.latest_employee_analysis TO authenticated;
GRANT SELECT ON public.employee_comprehensive_analysis TO authenticated;
GRANT SELECT ON public.employee_daily_activities TO authenticated;
GRANT SELECT ON public.employee_behavioral_patterns TO authenticated;
GRANT SELECT ON public.employee_management_insights TO authenticated;
GRANT SELECT ON public.employee_analysis_requests TO authenticated;

-- Comments for documentation
COMMENT ON TABLE public.employee_comprehensive_analysis IS 'Stores comprehensive AI-powered employee analysis results including productivity, behavioral, and security insights';
COMMENT ON TABLE public.employee_daily_activities IS 'Daily activity summaries extracted from comprehensive analysis for quick access';
COMMENT ON TABLE public.employee_behavioral_patterns IS 'Behavioral patterns and work style analysis for employee development';
COMMENT ON TABLE public.employee_management_insights IS 'Management recommendations and coaching insights for employee development';
COMMENT ON TABLE public.employee_analysis_requests IS 'Tracks analysis requests and their processing status for monitoring and debugging';

-- Sample insert function for testing
CREATE OR REPLACE FUNCTION public.create_sample_analysis(
    p_user_id UUID,
    p_analysis_date DATE DEFAULT CURRENT_DATE
) RETURNS UUID AS $$
DECLARE
    analysis_id TEXT;
    sample_data JSONB;
BEGIN
    analysis_id := p_user_id::TEXT || '-' || p_analysis_date::TEXT;
    
    sample_data := '{
        "executive_summary": "Sample comprehensive analysis for testing purposes",
        "productivity_insights": {
            "overall_productivity_score": 75,
            "peak_performance_hours": ["09:00-11:00", "14:00-16:00"],
            "improvement_suggestions": ["Focus on reducing interruptions", "Use time-blocking techniques"]
        },
        "behavioral_patterns": {
            "work_style_description": "Methodical and detail-oriented worker",
            "positive_behaviors": ["Consistent work schedule", "Good documentation habits"],
            "areas_for_improvement": ["Reduce multitasking", "Take more regular breaks"]
        },
        "security_analysis": {
            "risk_level": "low",
            "suspicious_activities": [],
            "security_recommendations": ["Continue following security best practices"]
        },
        "confidence_score": 85
    }';
    
    INSERT INTO public.employee_comprehensive_analysis (
        id, user_id, analysis_date, analysis_data, confidence_score, productivity_score, security_risk_level
    ) VALUES (
        analysis_id, p_user_id, p_analysis_date, sample_data, 85, 75, 'low'
    ) ON CONFLICT (user_id, analysis_date) DO UPDATE SET
        analysis_data = EXCLUDED.analysis_data,
        confidence_score = EXCLUDED.confidence_score,
        productivity_score = EXCLUDED.productivity_score,
        updated_at = NOW();
    
    RETURN p_user_id;
END;
$$ LANGUAGE plpgsql; 