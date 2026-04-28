-- Temporarily disable RLS on screenshots table for testing
-- This allows the Electron app to upload screenshots without authentication issues
ALTER TABLE public.screenshots DISABLE ROW LEVEL SECURITY; 