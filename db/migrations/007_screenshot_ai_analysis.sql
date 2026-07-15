-- Screenshot AI analysis columns + backfill index
-- Run against revclouddb after 006_*.sql

ALTER TABLE time_doctor.screenshots
  ADD COLUMN IF NOT EXISTS ai_analysis_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (ai_analysis_status IN (
      'pending', 'queued', 'processing', 'completed', 'failed', 'skipped'
    )),
  ADD COLUMN IF NOT EXISTS ai_queued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_error_message TEXT,
  ADD COLUMN IF NOT EXISTS ai_model_used TEXT,
  ADD COLUMN IF NOT EXISTS activity_type TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS is_work_related BOOLEAN,
  ADD COLUMN IF NOT EXISTS confidence_score INTEGER
    CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 100)),
  ADD COLUMN IF NOT EXISTS distraction_score INTEGER
    CHECK (distraction_score IS NULL OR (distraction_score >= 0 AND distraction_score <= 100)),
  ADD COLUMN IF NOT EXISTS vision_analysis JSONB,
  ADD COLUMN IF NOT EXISTS vision_summary TEXT;

COMMENT ON COLUMN time_doctor.screenshots.ai_analysis_status IS
  'AI pipeline: pending → queued → processing → completed | failed | skipped';

CREATE INDEX IF NOT EXISTS idx_td_screenshots_ai_backfill
  ON time_doctor.screenshots (ai_analysis_status, captured_at ASC)
  WHERE ai_analysis_status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_td_screenshots_ai_completed
  ON time_doctor.screenshots (user_id, captured_at DESC)
  WHERE ai_analysis_status = 'completed';

-- Existing rows without a valid S3 object cannot be analyzed by the worker
UPDATE time_doctor.screenshots
SET
  ai_analysis_status = 'skipped',
  ai_error_message = 'missing_or_invalid_s3_key'
WHERE s3_key IS NULL
   OR btrim(s3_key) = ''
   OR length(btrim(s3_key)) < 12
   OR btrim(s3_key) NOT LIKE '%/%';

-- All other existing rows remain ai_analysis_status = 'pending' for backfill
