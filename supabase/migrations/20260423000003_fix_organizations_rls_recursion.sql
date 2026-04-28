-- Fix: organizations RLS recursion (PostgREST error 42P17)
-- The existing organizations policies reference public.users, whose RLS policies also reference helpers that query public.users,
-- causing infinite recursion for anon/authenticated reads.

-- Helper: read current user's org/admin flags without triggering RLS recursion.
-- SECURITY DEFINER owned by postgres bypasses RLS, and we explicitly disable row_security for the function scope.
CREATE OR REPLACE FUNCTION public.get_current_user_context()
RETURNS TABLE (
  user_id uuid,
  organization_id uuid,
  role text,
  is_org_admin boolean,
  is_super_admin boolean
) AS $$
BEGIN
  PERFORM set_config('row_security', 'off', true);

  RETURN QUERY
  SELECT
    u.id,
    u.organization_id,
    u.role,
    COALESCE(u.is_org_admin, false),
    COALESCE(u.is_super_admin, false)
  FROM public.users u
  WHERE u.id = auth.uid();
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public;

REVOKE ALL ON FUNCTION public.get_current_user_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_user_context() TO anon, authenticated;

-- Replace organizations policies with non-recursive versions.
DROP POLICY IF EXISTS "organizations_select_policy" ON public.organizations;
DROP POLICY IF EXISTS "organizations_insert_policy" ON public.organizations;
DROP POLICY IF EXISTS "organizations_update_policy" ON public.organizations;
DROP POLICY IF EXISTS "organizations_delete_policy" ON public.organizations;

-- Allow login UI to validate org slug without auth.
CREATE POLICY "organizations_select_policy" ON public.organizations
  FOR SELECT
  TO anon, authenticated
  USING (
    -- anon: allow reading active orgs (needed for login slug validation)
    (auth.role() = 'anon' AND is_active = TRUE)
    OR
    -- authenticated: allow own org (or super admin)
    EXISTS (
      SELECT 1
      FROM public.get_current_user_context() ctx
      WHERE ctx.is_super_admin = TRUE
         OR (ctx.organization_id IS NOT NULL AND ctx.organization_id = organizations.id)
    )
  );

-- Only super admins can create/update/delete orgs.
CREATE POLICY "organizations_insert_policy" ON public.organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.get_current_user_context() ctx
      WHERE ctx.is_super_admin = TRUE
    )
  );

CREATE POLICY "organizations_update_policy" ON public.organizations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.get_current_user_context() ctx
      WHERE ctx.is_super_admin = TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.get_current_user_context() ctx
      WHERE ctx.is_super_admin = TRUE
    )
  );

CREATE POLICY "organizations_delete_policy" ON public.organizations
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.get_current_user_context() ctx
      WHERE ctx.is_super_admin = TRUE
    )
  );

