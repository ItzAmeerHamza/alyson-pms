-- Add perceptual_hash column for client-side computed image hashes
-- This enables accurate duplicate detection based on visual similarity
-- The hash is computed using the dHash algorithm on the desktop agent

-- Add perceptual_hash column
ALTER TABLE public.screenshots 
ADD COLUMN IF NOT EXISTS perceptual_hash TEXT;

-- Create index for efficient duplicate detection queries
-- This index allows fast lookup of screenshots with the same or similar hash
CREATE INDEX IF NOT EXISTS idx_screenshots_perceptual_hash 
ON public.screenshots(perceptual_hash) 
WHERE perceptual_hash IS NOT NULL;

-- Create a composite index for user + hash lookups (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_screenshots_user_perceptual_hash 
ON public.screenshots(user_id, perceptual_hash, captured_at DESC) 
WHERE perceptual_hash IS NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN public.screenshots.perceptual_hash IS 
'16-character hex string representing 64-bit dHash (difference hash) computed on the desktop agent. Used for accurate visual similarity detection. Hamming distance < 10 indicates similar images.';

-- Create function to find visually similar screenshots for a user
CREATE OR REPLACE FUNCTION find_similar_screenshots(
  input_user_id UUID,
  input_hash TEXT,
  hours_back INTEGER DEFAULT 1,
  max_results INTEGER DEFAULT 10
)
RETURNS TABLE(
  screenshot_id UUID,
  captured_at TIMESTAMPTZ,
  perceptual_hash TEXT,
  activity_percent INTEGER,
  app_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Return screenshots with same perceptual hash (exact visual match)
  -- Note: Hamming distance comparison would require pgvector or application logic
  RETURN QUERY
  SELECT 
    s.id as screenshot_id,
    s.captured_at,
    s.perceptual_hash,
    s.activity_percent,
    s.app_name
  FROM public.screenshots s
  WHERE s.user_id = input_user_id
    AND s.perceptual_hash = input_hash
    AND s.captured_at >= NOW() - (hours_back || ' hours')::interval
  ORDER BY s.captured_at DESC
  LIMIT max_results;
END;
$$
SET search_path = 'public';

-- Grant execute permission to authenticated users and service role
GRANT EXECUTE ON FUNCTION find_similar_screenshots TO authenticated;
GRANT EXECUTE ON FUNCTION find_similar_screenshots TO service_role;

-- Create a view for duplicate detection statistics
CREATE OR REPLACE VIEW perceptual_hash_duplicates AS
SELECT 
  user_id,
  perceptual_hash,
  COUNT(*) as duplicate_count,
  MIN(captured_at) as first_seen,
  MAX(captured_at) as last_seen,
  AVG(activity_percent) as avg_activity,
  DATE(MIN(captured_at)) as date
FROM public.screenshots
WHERE perceptual_hash IS NOT NULL
GROUP BY user_id, perceptual_hash
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, last_seen DESC;

-- Grant access to the view
GRANT SELECT ON perceptual_hash_duplicates TO authenticated;
GRANT SELECT ON perceptual_hash_duplicates TO service_role;

-- Log the migration
DO $$
BEGIN
  INSERT INTO public.system_checks (check_type, test_data, status, completed_at)
  VALUES (
    'perceptual_hash_migration',
    jsonb_build_object(
      'message', 'Added perceptual_hash column for visual duplicate detection',
      'column', 'perceptual_hash',
      'table', 'screenshots',
      'algorithm', 'dHash (64-bit difference hash)',
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
