-- Align remote DB with code that writes vision fields from ai-screenshot-analyzer / vision-validator.

DO $$ BEGIN
  ALTER TABLE public.screenshots ADD COLUMN IF NOT EXISTS vision_detected_content TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.screenshots ADD COLUMN IF NOT EXISTS vision_category TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.screenshots ADD COLUMN IF NOT EXISTS vision_confidence DOUBLE PRECISION;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.screenshots ADD COLUMN IF NOT EXISTS vision_privacy_concerns JSONB;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

COMMENT ON COLUMN public.screenshots.vision_detected_content IS 'Multimodal model text description of screenshot (same as vision_content when vision succeeds)';
