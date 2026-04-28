-- Desktop Agent Schema Compatibility
-- Adds columns expected by the desktop agent to prevent PostgREST PGRST204 schema-cache errors.
-- Idempotent: safe to re-run.

-- 1) app_logs: support session-style app usage windows
ALTER TABLE public.app_logs
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

ALTER TABLE public.app_logs
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

-- Optional: backfill started_at from legacy timestamp if present
UPDATE public.app_logs
SET started_at = COALESCE(started_at, "timestamp", created_at)
WHERE started_at IS NULL;

-- 2) screenshots: support agent inserts that use image_url
ALTER TABLE public.screenshots
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Optional: backfill image_url from legacy file_path if present
UPDATE public.screenshots
SET image_url = COALESCE(image_url, file_path)
WHERE image_url IS NULL;

-- Optional: Ask PostgREST to reload schema cache (helps avoid lingering PGRST204 after migrations)
-- This is safe on Supabase and is a no-op if PostgREST isn't listening.
NOTIFY pgrst, 'reload schema';

