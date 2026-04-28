-- Disable Row Level Security on screenshots table to allow Electron app uploads
ALTER TABLE public.screenshots DISABLE ROW LEVEL SECURITY;

-- Create a simple policy to allow all operations for testing
-- This can be refined later with proper user authentication
CREATE POLICY "Allow all operations on screenshots" ON public.screenshots
FOR ALL USING (true) WITH CHECK (true); 