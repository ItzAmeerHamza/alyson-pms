-- Fix screenshot date column mismatch
-- Issue: Database schema uses 'timestamp' but application code expects 'captured_at'
-- Solution: Add captured_at column and keep it synchronized with timestamp

-- Add captured_at column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'screenshots' 
    AND column_name = 'captured_at'
    AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.screenshots ADD COLUMN captured_at TIMESTAMPTZ;
    COMMENT ON COLUMN public.screenshots.captured_at IS 'Screenshot capture timestamp - synchronized with timestamp column for app compatibility';
  END IF;
END $$;

-- Copy existing timestamp data to captured_at
UPDATE public.screenshots 
SET captured_at = timestamp 
WHERE captured_at IS NULL AND timestamp IS NOT NULL;

-- Create function to keep timestamp and captured_at in sync
CREATE OR REPLACE FUNCTION sync_screenshot_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  -- If timestamp is updated, update captured_at
  IF TG_OP = 'UPDATE' AND OLD.timestamp IS DISTINCT FROM NEW.timestamp THEN
    NEW.captured_at = NEW.timestamp;
  END IF;
  
  -- If captured_at is updated, update timestamp  
  IF TG_OP = 'UPDATE' AND OLD.captured_at IS DISTINCT FROM NEW.captured_at THEN
    NEW.timestamp = NEW.captured_at;
  END IF;
  
  -- For INSERT, ensure both are set
  IF TG_OP = 'INSERT' THEN
    IF NEW.captured_at IS NULL AND NEW.timestamp IS NOT NULL THEN
      NEW.captured_at = NEW.timestamp;
    ELSIF NEW.timestamp IS NULL AND NEW.captured_at IS NOT NULL THEN
      NEW.timestamp = NEW.captured_at;
    ELSIF NEW.captured_at IS NULL AND NEW.timestamp IS NULL THEN
      NEW.captured_at = NOW();
      NEW.timestamp = NOW();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS sync_screenshot_timestamps_trigger ON public.screenshots;

-- Create trigger to keep columns synchronized
CREATE TRIGGER sync_screenshot_timestamps_trigger
  BEFORE INSERT OR UPDATE ON public.screenshots
  FOR EACH ROW
  EXECUTE FUNCTION sync_screenshot_timestamps();

-- Add index on captured_at for query performance
CREATE INDEX IF NOT EXISTS idx_screenshots_captured_at ON public.screenshots(captured_at);

-- Add comment explaining the solution
COMMENT ON TRIGGER sync_screenshot_timestamps_trigger ON public.screenshots IS 
'Keeps timestamp and captured_at columns synchronized. App code uses captured_at while original schema used timestamp.';

-- Verify the fix by checking if both columns exist
DO $$
DECLARE
  has_timestamp boolean;
  has_captured_at boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'screenshots' AND column_name = 'timestamp' AND table_schema = 'public'
  ) INTO has_timestamp;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'screenshots' AND column_name = 'captured_at' AND table_schema = 'public'
  ) INTO has_captured_at;
  
  IF has_timestamp AND has_captured_at THEN
    RAISE NOTICE 'SUCCESS: Both timestamp and captured_at columns exist and will be kept in sync';
  ELSE
    RAISE WARNING 'ISSUE: Missing columns - timestamp: %, captured_at: %', has_timestamp, has_captured_at;
  END IF;
END $$; 