-- AI Insights Worker System Migration
-- Creates tables for managing AI worker status, queue, and analytics

-- Worker Status Table
CREATE TABLE IF NOT EXISTS worker_status (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    worker_type TEXT NOT NULL UNIQUE,
    is_running BOOLEAN DEFAULT true,
    last_run TIMESTAMPTZ,
    next_run TIMESTAMPTZ,
    last_processed_count INTEGER DEFAULT 0,
    error_rate DECIMAL(5,2) DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Analysis Queue Table
CREATE TABLE IF NOT EXISTS ai_analysis_queue (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_data JSONB NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    priority INTEGER DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    error_message TEXT,
    result JSONB,
    retry_count INTEGER DEFAULT 0
);

-- AI Employee Insights Table (Enhanced)
CREATE TABLE IF NOT EXISTS ai_employee_insights (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    analysis_type TEXT DEFAULT 'comprehensive' CHECK (analysis_type IN ('comprehensive', 'productivity', 'security', 'behavioral')),
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    insights JSONB NOT NULL,
    confidence_score INTEGER CHECK (confidence_score BETWEEN 0 AND 100),
    ai_model TEXT DEFAULT 'gpt-4o-mini',
    analysis_version TEXT DEFAULT '1.0.0',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Analysis Metrics Table
CREATE TABLE IF NOT EXISTS ai_analysis_metrics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE DEFAULT CURRENT_DATE,
    total_analyses INTEGER DEFAULT 0,
    successful_analyses INTEGER DEFAULT 0,
    failed_analyses INTEGER DEFAULT 0,
    avg_confidence_score DECIMAL(5,2),
    avg_processing_time_seconds DECIMAL(8,2),
    openai_api_calls INTEGER DEFAULT 0,
    openai_tokens_used INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_worker_status_type ON worker_status(worker_type);
CREATE INDEX IF NOT EXISTS idx_ai_queue_status_priority ON ai_analysis_queue(status, priority);
CREATE INDEX IF NOT EXISTS idx_ai_insights_user_period ON ai_employee_insights(user_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_ai_insights_created_at ON ai_employee_insights(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_metrics_date ON ai_analysis_metrics(date);

-- RLS Policies
ALTER TABLE worker_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analysis_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_employee_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analysis_metrics ENABLE ROW LEVEL SECURITY;

-- Admin only access for worker status and queue
CREATE POLICY "Admin can view worker status" ON worker_status
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

CREATE POLICY "Service role can manage worker status" ON worker_status
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Admin can view analysis queue" ON ai_analysis_queue
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

CREATE POLICY "Service role can manage analysis queue" ON ai_analysis_queue
    FOR ALL USING (auth.role() = 'service_role');

-- Employee insights policies
CREATE POLICY "Admin can view all insights" ON ai_employee_insights
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

CREATE POLICY "Users can view own insights" ON ai_employee_insights
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service role can manage insights" ON ai_employee_insights
    FOR ALL USING (auth.role() = 'service_role');

-- Metrics policies (admin only)
CREATE POLICY "Admin can view metrics" ON ai_analysis_metrics
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

CREATE POLICY "Service role can manage metrics" ON ai_analysis_metrics
    FOR ALL USING (auth.role() = 'service_role');

-- Initialize worker status
INSERT INTO worker_status (worker_type, is_running, last_run) 
VALUES ('ai_insights', true, NOW()) 
ON CONFLICT (worker_type) DO NOTHING;

-- Function to update metrics
CREATE OR REPLACE FUNCTION update_ai_analysis_metrics()
RETURNS TRIGGER AS $$
BEGIN
    -- Update daily metrics when analysis completes
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        INSERT INTO ai_analysis_metrics (
            date, 
            total_analyses, 
            successful_analyses,
            openai_api_calls
        ) VALUES (
            CURRENT_DATE, 
            1, 
            1,
            1
        )
        ON CONFLICT (date) DO UPDATE SET
            total_analyses = ai_analysis_metrics.total_analyses + 1,
            successful_analyses = ai_analysis_metrics.successful_analyses + 1,
            openai_api_calls = ai_analysis_metrics.openai_api_calls + 1,
            updated_at = NOW();
    
    ELSIF NEW.status = 'failed' AND OLD.status != 'failed' THEN
        INSERT INTO ai_analysis_metrics (
            date, 
            total_analyses, 
            failed_analyses
        ) VALUES (
            CURRENT_DATE, 
            1, 
            1
        )
        ON CONFLICT (date) DO UPDATE SET
            total_analyses = ai_analysis_metrics.total_analyses + 1,
            failed_analyses = ai_analysis_metrics.failed_analyses + 1,
            updated_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for metrics updates
DROP TRIGGER IF EXISTS trigger_update_ai_metrics ON ai_analysis_queue;
CREATE TRIGGER trigger_update_ai_metrics
    AFTER UPDATE ON ai_analysis_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_analysis_metrics();

-- Function to get worker status (for edge function)
CREATE OR REPLACE FUNCTION get_worker_status(worker_type_param TEXT)
RETURNS TABLE (
    is_running BOOLEAN,
    last_run TIMESTAMPTZ,
    next_run TIMESTAMPTZ,
    processed_today INTEGER,
    pending_analyses INTEGER,
    error_rate DECIMAL,
    openai_enabled BOOLEAN
) 
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ws.is_running,
        ws.last_run,
        ws.last_run + INTERVAL '15 minutes' as next_run,
        COALESCE((
            SELECT SUM(successful_analyses) 
            FROM ai_analysis_metrics 
            WHERE date = CURRENT_DATE
        ), 0)::INTEGER as processed_today,
        (
            SELECT COUNT(*)::INTEGER 
            FROM ai_analysis_queue 
            WHERE status = 'pending'
        ) as pending_analyses,
        ws.error_rate,
        true as openai_enabled -- This would be set based on actual API key presence
    FROM worker_status ws
    WHERE ws.worker_type = worker_type_param;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Comments for documentation
COMMENT ON TABLE worker_status IS 'Tracks status and health of AI worker processes';
COMMENT ON TABLE ai_analysis_queue IS 'Queue for AI analysis jobs with priority and retry logic';
COMMENT ON TABLE ai_employee_insights IS 'Stores comprehensive AI-generated employee insights';
COMMENT ON TABLE ai_analysis_metrics IS 'Daily metrics and performance tracking for AI analysis';

COMMENT ON COLUMN ai_employee_insights.insights IS 'JSON object containing AI analysis results from OpenAI GPT-4o-mini';
COMMENT ON COLUMN ai_employee_insights.confidence_score IS 'AI confidence level from 0-100';
COMMENT ON COLUMN ai_analysis_queue.priority IS '1=high, 2=medium, 3=low priority';
COMMENT ON COLUMN worker_status.error_rate IS 'Percentage of failed analyses in last 24 hours'; 