-- Add AI analysis columns to screenshots table
-- These columns store server-side AI analysis results for content categorization

-- Add AI analysis columns
ALTER TABLE public.screenshots ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.screenshots ADD COLUMN IF NOT EXISTS distraction_score INTEGER CHECK (distraction_score >= 0 AND distraction_score <= 100);
ALTER TABLE public.screenshots ADD COLUMN IF NOT EXISTS activity_type TEXT;
ALTER TABLE public.screenshots ADD COLUMN IF NOT EXISTS confidence_score INTEGER CHECK (confidence_score >= 0 AND confidence_score <= 100);

-- Add analysis timestamp and processing status
ALTER TABLE public.screenshots ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ;
ALTER TABLE public.screenshots ADD COLUMN IF NOT EXISTS ai_analysis_status TEXT DEFAULT 'pending' CHECK (ai_analysis_status IN ('pending', 'processing', 'completed', 'failed'));

-- Add enhanced AI metadata column for advanced analysis
ALTER TABLE public.screenshots ADD COLUMN IF NOT EXISTS ai_metadata JSONB;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_screenshots_category ON public.screenshots(category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_screenshots_distraction_score ON public.screenshots(distraction_score) WHERE distraction_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_screenshots_ai_analysis_status ON public.screenshots(ai_analysis_status);
CREATE INDEX IF NOT EXISTS idx_screenshots_ai_analyzed_at ON public.screenshots(ai_analyzed_at);

-- Create index for finding unanalyzed screenshots
CREATE INDEX IF NOT EXISTS idx_screenshots_unanalyzed ON public.screenshots(captured_at) 
WHERE ai_analysis_status = 'pending' OR ai_analysis_status IS NULL;

-- Create index for duplicate detection
CREATE INDEX IF NOT EXISTS idx_screenshots_duplicate_hash ON public.screenshots USING GIN ((ai_metadata->'duplicate_hash'));

-- Create index for privacy risk queries
CREATE INDEX IF NOT EXISTS idx_screenshots_privacy_risk ON public.screenshots USING GIN ((ai_metadata->'privacy_risk_score'));

-- Add comments explaining the AI analysis columns
COMMENT ON COLUMN public.screenshots.category IS 'AI-determined content category: social_media, gaming, entertainment, productive';
COMMENT ON COLUMN public.screenshots.distraction_score IS 'AI-calculated distraction score (0-100), higher = more distracting';
COMMENT ON COLUMN public.screenshots.activity_type IS 'Specific activity type detected by AI: coding, social_networking, gaming, etc.';
COMMENT ON COLUMN public.screenshots.confidence_score IS 'AI confidence in the analysis (0-100)';
COMMENT ON COLUMN public.screenshots.ai_analyzed_at IS 'Timestamp when AI analysis was completed';
COMMENT ON COLUMN public.screenshots.ai_analysis_status IS 'Current status of AI analysis processing';
COMMENT ON COLUMN public.screenshots.ai_metadata IS 'Enhanced AI analysis data: duplicate_hash, privacy_risk_score, meeting_detected, document_type, visual_elements, etc.';

-- Create a view for AI analysis statistics
CREATE OR REPLACE VIEW ai_analysis_stats AS
SELECT 
  ai_analysis_status,
  category,
  COUNT(*) as count,
  AVG(distraction_score) as avg_distraction_score,
  AVG(confidence_score) as avg_confidence_score,
  COUNT(CASE WHEN ai_metadata->>'meeting_detected' = 'true' THEN 1 END) as meeting_count,
  COUNT(CASE WHEN ai_metadata->>'inappropriate_content' = 'true' THEN 1 END) as inappropriate_count,
  COUNT(CASE WHEN (ai_metadata->>'privacy_risk_score')::int > 50 THEN 1 END) as privacy_risk_count
FROM public.screenshots 
WHERE captured_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY ai_analysis_status, category
ORDER BY count DESC;

-- Create function to find potential duplicates
CREATE OR REPLACE FUNCTION find_duplicate_screenshots(
  input_user_id UUID,
  input_duplicate_hash TEXT,
  hours_back INTEGER DEFAULT 24
)
RETURNS TABLE(
  screenshot_id UUID,
  captured_at TIMESTAMPTZ,
  similarity_score INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id as screenshot_id,
    s.captured_at,
    90 as similarity_score -- Base similarity for same hash
  FROM public.screenshots s
  WHERE s.user_id = input_user_id
    AND s.ai_metadata->>'duplicate_hash' = input_duplicate_hash
    AND s.captured_at >= NOW() - (hours_back || ' hours')::interval
  ORDER BY s.captured_at DESC;
END;
$$;

-- Create function to mark screenshot for re-analysis
CREATE OR REPLACE FUNCTION mark_screenshot_for_reanalysis(screenshot_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.screenshots 
  SET ai_analysis_status = 'pending',
      ai_analyzed_at = NULL,
      ai_metadata = COALESCE(ai_metadata, '{}'::jsonb) || jsonb_build_object('reanalysis_requested_at', NOW())
  WHERE id = screenshot_id;
  
  RETURN FOUND;
END;
$$;

-- Create function to get privacy risk screenshots
CREATE OR REPLACE FUNCTION get_privacy_risk_screenshots(
  input_user_id UUID DEFAULT NULL,
  risk_threshold INTEGER DEFAULT 50,
  hours_back INTEGER DEFAULT 168 -- 1 week
)
RETURNS TABLE(
  screenshot_id UUID,
  user_id UUID,
  captured_at TIMESTAMPTZ,
  privacy_risk_score INTEGER,
  privacy_concerns TEXT[]
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id as screenshot_id,
    s.user_id,
    s.captured_at,
    (s.ai_metadata->>'privacy_risk_score')::INTEGER as privacy_risk_score,
    ARRAY(SELECT jsonb_array_elements_text(s.ai_metadata->'privacy_concerns')) as privacy_concerns
  FROM public.screenshots s
  WHERE (input_user_id IS NULL OR s.user_id = input_user_id)
    AND (s.ai_metadata->>'privacy_risk_score')::INTEGER >= risk_threshold
    AND s.captured_at >= NOW() - (hours_back || ' hours')::interval
    AND s.ai_analysis_status = 'completed'
  ORDER BY (s.ai_metadata->>'privacy_risk_score')::INTEGER DESC, s.captured_at DESC;
END;
$$;

-- Log the schema update
INSERT INTO public.system_checks (check_type, test_data, status, completed_at)
VALUES (
    'ai_analysis_columns_added',
    jsonb_build_object(
        'message', 'AI analysis columns added to screenshots table',
        'timestamp', NOW()
    ),
    'completed',
    NOW()
) ON CONFLICT DO NOTHING;