-- Create idle_logs table that was missing from the schema
CREATE TABLE IF NOT EXISTS public.idle_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    project_id UUID,
    idle_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    idle_end TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Disable RLS for consistency with other tables
ALTER TABLE public.idle_logs DISABLE ROW LEVEL SECURITY;

-- Create permissive policy
DROP POLICY IF EXISTS "Allow all idle_logs operations" ON public.idle_logs;
CREATE POLICY "Allow all idle_logs operations" ON public.idle_logs
FOR ALL USING (true) WITH CHECK (true);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_idle_logs_user_id ON public.idle_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_idle_logs_start_time ON public.idle_logs(idle_start);

-- Add missing idle_seconds column to time_logs table
ALTER TABLE public.time_logs ADD COLUMN IF NOT EXISTS idle_seconds INTEGER DEFAULT 0;
