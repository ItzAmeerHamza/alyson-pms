DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage schema not available yet; skipping screenshots bucket/policies';
    RETURN;
  END IF;

  -- Create screenshots storage bucket
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'screenshots',
    'screenshots',
    true,
    52428800, -- 50MB limit
    ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
  ) ON CONFLICT (id) DO NOTHING;

  -- Create policy to allow public read access to screenshots
  EXECUTE 'DROP POLICY IF EXISTS "Public Access" ON storage.objects';
  EXECUTE 'CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = ''screenshots'')';

  -- Create policy to allow authenticated users to upload screenshots
  EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects';
  EXECUTE 'CREATE POLICY "Allow authenticated uploads" ON storage.objects
           FOR INSERT
           WITH CHECK (bucket_id = ''screenshots'' AND auth.role() = ''authenticated'')';

  -- Create policy to allow anon uploads for desktop app
  EXECUTE 'DROP POLICY IF EXISTS "Allow anon uploads for desktop app" ON storage.objects';
  EXECUTE 'CREATE POLICY "Allow anon uploads for desktop app" ON storage.objects
           FOR INSERT
           WITH CHECK (bucket_id = ''screenshots'' AND auth.role() = ''anon'')';

  -- Create policy to allow users to update their own screenshots
  EXECUTE 'DROP POLICY IF EXISTS "Allow users to update own screenshots" ON storage.objects';
  EXECUTE 'CREATE POLICY "Allow users to update own screenshots" ON storage.objects
           FOR UPDATE
           USING (bucket_id = ''screenshots'' AND auth.uid()::text = (storage.foldername(name))[1])';

  -- Create policy to allow users to delete their own screenshots
  EXECUTE 'DROP POLICY IF EXISTS "Allow users to delete own screenshots" ON storage.objects';
  EXECUTE 'CREATE POLICY "Allow users to delete own screenshots" ON storage.objects
           FOR DELETE
           USING (bucket_id = ''screenshots'' AND auth.uid()::text = (storage.foldername(name))[1])';
END
$$;