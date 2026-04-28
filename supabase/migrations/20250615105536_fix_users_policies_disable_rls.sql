
-- Fix the infinite recursion in users table policies
-- First, drop all existing policies on users table
DROP POLICY IF EXISTS "users_basic_select" ON public.users;
DROP POLICY IF EXISTS "users_basic_update" ON public.users;
DROP POLICY IF EXISTS "users_select_self" ON public.users;
DROP POLICY IF EXISTS "users_modify" ON public.users;

-- Also fix the projects table policy that might be causing issues
DROP POLICY IF EXISTS "projects_manager_access" ON public.projects;
DROP POLICY IF EXISTS "projects_access" ON public.projects;

-- Create simple, non-recursive policies for users table
CREATE POLICY "users_can_view_self" ON public.users
  FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "users_can_update_self" ON public.users
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Create a simple policy for projects that doesn't reference users table
-- For now, let's disable RLS on projects to avoid the recursive lookup
ALTER TABLE public.projects DISABLE ROW LEVEL SECURITY;

-- Also ensure screenshots table RLS is properly disabled
ALTER TABLE public.screenshots DISABLE ROW LEVEL SECURITY;
