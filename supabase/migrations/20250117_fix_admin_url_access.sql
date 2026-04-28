-- Fix RLS policy to allow admin users to access all URL data
-- This allows the web admin console to display URL data for all employees

DO $$
BEGIN
  IF to_regclass('public.app_url_activity') IS NOT NULL THEN
    -- Drop the existing restrictive policy
    DROP POLICY IF EXISTS select_own_url_activity ON public.app_url_activity;

    -- Create a new policy that allows:
    -- 1. Users to see their own data (auth.uid() = user_id)
    -- 2. Admin users to see all data (role = 'admin')
    DROP POLICY IF EXISTS select_url_activity_admin_access ON public.app_url_activity;
    CREATE POLICY select_url_activity_admin_access ON public.app_url_activity
    FOR SELECT USING (
      auth.uid() = user_id OR 
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
        AND u.role = 'admin'
      )
    );

    -- Also fix the insert policy to be more permissive for admin users
    DROP POLICY IF EXISTS insert_own_url_activity ON public.app_url_activity;
    DROP POLICY IF EXISTS insert_url_activity_admin_access ON public.app_url_activity;
    CREATE POLICY insert_url_activity_admin_access ON public.app_url_activity
    FOR INSERT WITH CHECK (
      auth.uid() = user_id OR 
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
        AND u.role = 'admin'
      )
    );
  END IF;
END $$;
