-- Fix critical screenshot security vulnerability
-- Users should only see their own screenshots, not other users' screenshots

-- Enable RLS on screenshots table
ALTER TABLE public.screenshots ENABLE ROW LEVEL SECURITY;

-- Drop all existing permissive policies
DROP POLICY IF EXISTS "Allow all operations on screenshots" ON public.screenshots;
DROP POLICY IF EXISTS "Allow all screenshot operations for troubleshooting" ON public.screenshots;
DROP POLICY IF EXISTS "Allow all screenshots operations" ON public.screenshots;
DROP POLICY IF EXISTS "Allow screenshot inserts for testing" ON public.screenshots;
DROP POLICY IF EXISTS "Users can view own screenshots" ON public.screenshots;
DROP POLICY IF EXISTS "Users can insert own screenshots" ON public.screenshots;
DROP POLICY IF EXISTS "Users can update own screenshots" ON public.screenshots;
DROP POLICY IF EXISTS "Service role can manage screenshots" ON public.screenshots;
DROP POLICY IF EXISTS "Admins can view all screenshots" ON public.screenshots;
DROP POLICY IF EXISTS "Admins can manage all screenshots" ON public.screenshots;
DROP POLICY IF EXISTS "screenshots_policy" ON public.screenshots;
DROP POLICY IF EXISTS "Public Access" ON public.screenshots;
DROP POLICY IF EXISTS "Service role can update screenshots" ON public.screenshots;

-- Create proper user isolation policies
-- Users can only view their own screenshots
CREATE POLICY "Users can view own screenshots" ON public.screenshots
    FOR SELECT USING (auth.uid() = user_id);

-- Users can only insert their own screenshots
CREATE POLICY "Users can insert own screenshots" ON public.screenshots
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only update their own screenshots
CREATE POLICY "Users can update own screenshots" ON public.screenshots
    FOR UPDATE USING (auth.uid() = user_id);

-- Admins can view all screenshots (for administrative purposes)
CREATE POLICY "Admins can view all screenshots" ON public.screenshots
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'manager')
        )
    );

-- Admins can manage all screenshots (for administrative purposes)
CREATE POLICY "Admins can manage all screenshots" ON public.screenshots
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'manager')
        )
    );

-- Special policy for service role (desktop agent with service key)
CREATE POLICY "Service role can manage screenshots" ON public.screenshots
    FOR ALL USING (auth.role() = 'service_role');

-- Add security comment
COMMENT ON TABLE public.screenshots IS 'Screenshots table with RLS enabled for user isolation - users can only see their own screenshots';

-- Also fix the storage bucket to ensure proper access controls
-- Guarded because `storage.objects` may not exist yet in some local setups.
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL OR to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'storage schema not available yet; skipping storage.objects policies update';
    RETURN;
  END IF;

  -- Update storage policies to ensure user isolation
  EXECUTE 'DROP POLICY IF EXISTS "Public Access" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "Allow anon uploads for desktop app" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "Allow users to update own screenshots" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "Allow users to delete own screenshots" ON storage.objects';

  -- Create proper storage policies
  EXECUTE 'CREATE POLICY "Users can view own screenshot files" ON storage.objects
           FOR SELECT USING (
             bucket_id = ''screenshots'' AND
             auth.uid()::text = (storage.foldername(name))[1]
           )';

  EXECUTE 'CREATE POLICY "Service role can manage screenshot files" ON storage.objects
           FOR ALL USING (bucket_id = ''screenshots'' AND auth.role() = ''service_role'')';

  EXECUTE 'CREATE POLICY "Admins can manage all screenshot files" ON storage.objects
           FOR ALL USING (
             bucket_id = ''screenshots'' AND
             EXISTS (
               SELECT 1 FROM public.users
               WHERE id = auth.uid()
               AND role IN (''admin'', ''manager'')
             )
           )';

  -- Make storage bucket private (not public)
  UPDATE storage.buckets
  SET public = false
  WHERE id = 'screenshots';
END
$$;

-- Log the security fix
INSERT INTO public.system_checks (check_type, test_data, status, completed_at)
VALUES (
    'screenshot_security_fix',
    jsonb_build_object(
        'message', 'Screenshot RLS policies enabled',
        'timestamp', NOW()
    ),
    'completed',
    NOW()
); 