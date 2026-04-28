
-- Clean up existing policies and create simpler ones
DROP POLICY IF EXISTS "projects_access" ON public.projects;

-- Create a simpler policy for projects that works with our authentication
CREATE POLICY "projects_policy" ON public.projects
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'manager')
    )
  );

-- Update users policies
DROP POLICY IF EXISTS "users_select_self" ON public.users;
DROP POLICY IF EXISTS "users_modify" ON public.users;

CREATE POLICY "users_select_policy" ON public.users
  FOR SELECT
  USING (
    id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "users_update_policy" ON public.users
  FOR UPDATE
  USING (
    id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  )
  WITH CHECK (
    id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

CREATE POLICY "users_insert_policy" ON public.users
  FOR INSERT
  WITH CHECK (id = auth.uid());
