-- AWS migration: Cognito identity + S3 screenshot keys
-- Safe to run on DB restored from Supabase (idempotent)

-- Link Cognito JWT "sub" to application users (email still used for admin workflows)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS cognito_sub TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_cognito_sub
  ON public.users (cognito_sub)
  WHERE cognito_sub IS NOT NULL;

COMMENT ON COLUMN public.users.cognito_sub IS 'Amazon Cognito user sub (JWT claim); maps to app user row';

-- S3 object key for screenshot binary (file_path / image_url may remain during transition)
ALTER TABLE public.screenshots
  ADD COLUMN IF NOT EXISTS s3_key TEXT;

CREATE INDEX IF NOT EXISTS idx_screenshots_s3_key
  ON public.screenshots (s3_key)
  WHERE s3_key IS NOT NULL;

COMMENT ON COLUMN public.screenshots.s3_key IS 'S3 object key in screenshots bucket; preferred over storage URL after AWS migration';
