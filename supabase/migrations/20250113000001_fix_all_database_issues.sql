-- Comprehensive Database Fix for Desktop Agent Issues
-- This script addresses RLS policies, missing columns, and foreign key constraints

-- ======================================
-- 1. FIX RLS POLICIES - PRIMARY ISSUE
-- ======================================

-- Temporarily disable RLS on all tables that are causing issues
ALTER TABLE IF EXISTS public.time_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.app_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.url_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.screenshots DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.idle_logs DISABLE ROW LEVEL SECURITY;

-- Drop all existing conflicting policies
DROP POLICY IF EXISTS "Users can view own time logs" ON public.time_logs;
DROP POLICY IF EXISTS "Users can insert own time logs" ON public.time_logs;
DROP POLICY IF EXISTS "Users can update own time logs" ON public.time_logs;
DROP POLICY IF EXISTS "time_logs_policy" ON public.time_logs;
DROP POLICY IF EXISTS "Allow all time_logs operations" ON public.time_logs;

DROP POLICY IF EXISTS "Users can view own app logs" ON public.app_logs;
DROP POLICY IF EXISTS "Users can insert own app logs" ON public.app_logs;
DROP POLICY IF EXISTS "Users can update own app logs" ON public.app_logs;
DROP POLICY IF EXISTS "Allow all app_logs operations" ON public.app_logs;

DROP POLICY IF EXISTS "Users can view own URL logs" ON public.url_logs;
DROP POLICY IF EXISTS "Users can insert own URL logs" ON public.url_logs;
DROP POLICY IF EXISTS "Allow all url_logs operations" ON public.url_logs;

DROP POLICY IF EXISTS "Users can view own screenshots" ON public.screenshots;
DROP POLICY IF EXISTS "Users can insert own screenshots" ON public.screenshots;
DROP POLICY IF EXISTS "Allow all screenshot operations" ON public.screenshots;
DROP POLICY IF EXISTS "Allow all screenshots operations" ON public.screenshots;

-- Create permissive policies for desktop agent functionality
CREATE POLICY "Desktop agent can manage time logs" ON public.time_logs
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Desktop agent can manage app logs" ON public.app_logs
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Desktop agent can manage url logs" ON public.url_logs
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Desktop agent can manage screenshots" ON public.screenshots
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Desktop agent can manage idle logs" ON public.idle_logs
    FOR ALL USING (true) WITH CHECK (true);

-- ======================================
-- 2. FIX MISSING COLUMNS
-- ======================================

-- Add missing template_type column to report_configurations
DO $$ 
BEGIN
    IF to_regclass('public.report_configurations') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'report_configurations'
             AND column_name = 'template_type'
       ) THEN
        ALTER TABLE public.report_configurations
        ADD COLUMN template_type TEXT DEFAULT 'daily';
    END IF;
END $$;

-- Ensure all required columns exist in screenshots table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'screenshots' AND column_name = 'keystrokes') THEN
        ALTER TABLE public.screenshots ADD COLUMN keystrokes INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'screenshots' AND column_name = 'mouse_clicks') THEN
        ALTER TABLE public.screenshots ADD COLUMN mouse_clicks INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'screenshots' AND column_name = 'mouse_movements') THEN
        ALTER TABLE public.screenshots ADD COLUMN mouse_movements INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'screenshots' AND column_name = 'activity_percent') THEN
        ALTER TABLE public.screenshots ADD COLUMN activity_percent INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'screenshots' AND column_name = 'app_name') THEN
        ALTER TABLE public.screenshots ADD COLUMN app_name TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'screenshots' AND column_name = 'window_title') THEN
        ALTER TABLE public.screenshots ADD COLUMN window_title TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'screenshots' AND column_name = 'url') THEN
        ALTER TABLE public.screenshots ADD COLUMN url TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'screenshots' AND column_name = 'has_context') THEN
        ALTER TABLE public.screenshots ADD COLUMN has_context BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Ensure idle_seconds column exists in time_logs
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'time_logs' AND column_name = 'idle_seconds') THEN
        ALTER TABLE public.time_logs ADD COLUMN idle_seconds INTEGER DEFAULT 0;
    END IF;
END $$;

-- ======================================
-- 3. ENSURE TABLES EXIST
-- ======================================

-- Create idle_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.idle_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    time_log_id UUID,
    project_id UUID,
    idle_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    idle_end TIMESTAMPTZ,
    duration_seconds INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create url_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.url_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    time_log_id UUID,
    url TEXT NOT NULL,
    title TEXT,
    domain TEXT,
    browser TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ======================================
-- 4. FIX FOREIGN KEY CONSTRAINTS
-- ======================================

-- Make foreign key constraints less strict (allow NULL time_log_id temporarily)
ALTER TABLE public.app_logs ALTER COLUMN time_log_id DROP NOT NULL;
ALTER TABLE public.url_logs ALTER COLUMN time_log_id DROP NOT NULL;
ALTER TABLE public.screenshots ALTER COLUMN time_log_id DROP NOT NULL;
ALTER TABLE public.idle_logs ALTER COLUMN time_log_id DROP NOT NULL;

-- ======================================
-- 5. CREATE INDEXES FOR PERFORMANCE
-- ======================================

CREATE INDEX IF NOT EXISTS idx_time_logs_user_id ON public.time_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_project_id ON public.time_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_app_logs_user_id ON public.app_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_app_logs_time_log_id ON public.app_logs(time_log_id);
CREATE INDEX IF NOT EXISTS idx_url_logs_user_id ON public.url_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_url_logs_time_log_id ON public.url_logs(time_log_id);
CREATE INDEX IF NOT EXISTS idx_screenshots_user_id ON public.screenshots(user_id);
CREATE INDEX IF NOT EXISTS idx_screenshots_time_log_id ON public.screenshots(time_log_id);

-- ======================================
-- 6. ADD HELPFUL COMMENTS
-- ======================================

COMMENT ON POLICY "Desktop agent can manage time logs" ON public.time_logs IS 'Temporary permissive policy for desktop agent - allows all operations until proper authentication is implemented';
COMMENT ON POLICY "Desktop agent can manage app logs" ON public.app_logs IS 'Temporary permissive policy for desktop agent - allows all operations until proper authentication is implemented';
COMMENT ON POLICY "Desktop agent can manage url logs" ON public.url_logs IS 'Temporary permissive policy for desktop agent - allows all operations until proper authentication is implemented';
COMMENT ON POLICY "Desktop agent can manage screenshots" ON public.screenshots IS 'Temporary permissive policy for desktop agent - allows all operations until proper authentication is implemented';

-- ======================================
-- 7. VERIFY CONFIGURATION
-- ======================================

-- Show table information
SELECT 
    'time_logs' as table_name,
    COUNT(*) as row_count,
    'RLS: ' || CASE WHEN pg_class.relrowsecurity THEN 'ENABLED' ELSE 'DISABLED' END as security_status
FROM public.time_logs, pg_class 
WHERE pg_class.relname = 'time_logs'
GROUP BY pg_class.relrowsecurity

UNION ALL

SELECT 
    'app_logs' as table_name,
    COUNT(*) as row_count,
    'RLS: ' || CASE WHEN pg_class.relrowsecurity THEN 'ENABLED' ELSE 'DISABLED' END as security_status
FROM public.app_logs, pg_class 
WHERE pg_class.relname = 'app_logs'
GROUP BY pg_class.relrowsecurity

UNION ALL

SELECT 
    'url_logs' as table_name,
    COUNT(*) as row_count,
    'RLS: ' || CASE WHEN pg_class.relrowsecurity THEN 'ENABLED' ELSE 'DISABLED' END as security_status
FROM public.url_logs, pg_class 
WHERE pg_class.relname = 'url_logs'
GROUP BY pg_class.relrowsecurity

UNION ALL

SELECT 
    'screenshots' as table_name,
    COUNT(*) as row_count,
    'RLS: ' || CASE WHEN pg_class.relrowsecurity THEN 'ENABLED' ELSE 'DISABLED' END as security_status
FROM public.screenshots, pg_class 
WHERE pg_class.relname = 'screenshots'
GROUP BY pg_class.relrowsecurity; 