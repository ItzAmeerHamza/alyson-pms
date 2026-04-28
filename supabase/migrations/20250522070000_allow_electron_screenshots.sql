-- Temporarily allow screenshot inserts for testing
-- This allows the Electron app to upload screenshots without authentication
CREATE POLICY "Allow screenshot inserts for testing" ON public.screenshots
FOR INSERT
TO anon
WITH CHECK (true); 