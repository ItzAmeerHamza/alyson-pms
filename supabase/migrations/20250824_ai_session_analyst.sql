-- Add columns and indexes to support AI session analysis and deduplication
DO $$ BEGIN
  ALTER TABLE public.screenshots ADD COLUMN IF NOT EXISTS image_sha256 text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.screenshots ADD COLUMN IF NOT EXISTS suspicion_score numeric;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.screenshots ADD COLUMN IF NOT EXISTS ai_flags jsonb;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.screenshots ADD COLUMN IF NOT EXISTS idle_inferred boolean;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_screenshots_image_sha256 ON public.screenshots (image_sha256);
CREATE INDEX IF NOT EXISTS idx_screenshots_ai_status_pending ON public.screenshots (ai_analysis_status) WHERE ai_analysis_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_screenshots_user_time ON public.screenshots (user_id, captured_at DESC);

-- Optional: unique exact-dup guard (commented out in case of historical duplicates)
-- CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uniq_user_image_hash ON public.screenshots (user_id, image_sha256);




