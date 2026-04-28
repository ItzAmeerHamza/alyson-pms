-- ============================================================================
-- Fix admin role update policy
-- ============================================================================
-- The users_update_policy from the multi-tenant migration (20260131) only
-- allows updates from super admins (is_super_admin) and org admins
-- (is_org_admin), but NOT from users with role = 'admin'. This causes
-- role changes from the admin panel to be silently blocked by RLS.
--
-- This migration consolidates all UPDATE policies on the users table into
-- a single policy that also permits role = 'admin' users to update other
-- users within their organization.
-- ============================================================================

-- Drop existing update policies (clean slate)
DROP POLICY IF EXISTS "users_update_policy" ON public.users;
DROP POLICY IF EXISTS "Allow admin to manage user status" ON public.users;
DROP POLICY IF EXISTS "users_can_update_self" ON public.users;

-- Create consolidated update policy
CREATE POLICY "users_update_policy" ON public.users
    FOR UPDATE USING (
        -- Can update own profile
        id = auth.uid()
        OR
        -- Super admins can update any user
        public.is_super_admin()
        OR
        -- Org admins can update users in their org
        (
            public.is_org_admin()
            AND (organization_id = public.get_user_organization_id() OR organization_id IS NULL)
        )
        OR
        -- Users with role = 'admin' can update users in their org
        (
            EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin' AND is_active = true)
            AND (organization_id = public.get_user_organization_id() OR organization_id IS NULL)
        )
    )
    WITH CHECK (
        id = auth.uid()
        OR public.is_super_admin()
        OR (
            public.is_org_admin()
            AND (organization_id = public.get_user_organization_id() OR organization_id IS NULL)
        )
        OR (
            EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin' AND is_active = true)
            AND (organization_id = public.get_user_organization_id() OR organization_id IS NULL)
        )
    );
