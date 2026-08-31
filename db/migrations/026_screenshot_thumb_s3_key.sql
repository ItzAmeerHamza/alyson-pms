-- Gallery thumbs: small JPEG next to the original screenshot object.
ALTER TABLE time_doctor.screenshots
  ADD COLUMN IF NOT EXISTS thumb_s3_key TEXT;

COMMENT ON COLUMN time_doctor.screenshots.thumb_s3_key IS
  'S3 key for ~480px JPEG used in Pulse/desktop grids; full image stays on s3_key';
