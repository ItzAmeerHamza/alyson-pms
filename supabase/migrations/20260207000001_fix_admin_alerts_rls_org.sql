-- ============================================================================
-- Fix admin_alerts RLS policies to filter by organization_id
-- ============================================================================
-- The existing RLS policies on admin_alerts allow any admin/manager to see
-- ALL alerts across ALL organizations. This migration updates the policies
-- to enforce organization-level isolation, matching the pattern used for
-- screenshots, time_logs, app_logs, etc.
-- ============================================================================

-- ============================================================================
-- 1. Drop existing policies
-- ============================================================================
DROP POLICY IF EXISTS "Admins can view all alerts" ON public.admin_alerts;
DROP POLICY IF EXISTS "Admins can update alerts" ON public.admin_alerts;
DROP POLICY IF EXISTS "Service role can manage alerts" ON public.admin_alerts;

-- ============================================================================
-- 2. Recreate policies with organization_id filtering
-- ============================================================================

-- SELECT: Admins/managers can see alerts in their own org (or legacy NULL org)
CREATE POLICY "admin_alerts_select_policy" ON public.admin_alerts
    FOR SELECT USING (
        -- Super admins can see all alerts
        public.is_super_admin()
        OR
        -- Admins/managers can see alerts in their organization (or legacy NULL org_id)
        (
            EXISTS (
                SELECT 1 FROM public.users
                WHERE users.id = auth.uid()::uuid
                AND users.role IN ('admin', 'manager')
            )
            AND (organization_id = public.get_user_organization_id() OR organization_id IS NULL)
        )
        OR
        -- Service role bypass (for edge functions)
        auth.jwt() ->> 'role' = 'service_role'
    );

-- UPDATE: Admins/managers can update alerts in their own org
CREATE POLICY "admin_alerts_update_policy" ON public.admin_alerts
    FOR UPDATE USING (
        -- Super admins can update any alert
        public.is_super_admin()
        OR
        -- Admins/managers can update alerts in their organization
        (
            EXISTS (
                SELECT 1 FROM public.users
                WHERE users.id = auth.uid()::uuid
                AND users.role IN ('admin', 'manager')
            )
            AND (organization_id = public.get_user_organization_id() OR organization_id IS NULL)
        )
        OR
        -- Service role bypass
        auth.jwt() ->> 'role' = 'service_role'
    );

-- ALL: Service role can manage all alerts (for edge functions inserting alerts)
CREATE POLICY "admin_alerts_service_role_policy" ON public.admin_alerts
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- 3. Backfill NULL organization_id on admin_alerts from user's org
-- ============================================================================
UPDATE public.admin_alerts aa
SET organization_id = u.organization_id
FROM public.users u
WHERE aa.user_id = u.id
  AND aa.organization_id IS NULL
  AND u.organization_id IS NOT NULL;

-- ============================================================================
-- 4. Log migration
-- ============================================================================
INSERT INTO public.system_logs (log_type, message, metadata)
VALUES (
  'migration',
  'Updated admin_alerts RLS policies for organization isolation',
  jsonb_build_object(
    'migration_file', '20260207_fix_admin_alerts_rls_org.sql',
    'changes', jsonb_build_array(
      'Dropped old non-org-aware RLS policies',
      'Created org-aware SELECT policy for admin_alerts',
      'Created org-aware UPDATE policy for admin_alerts',
      'Kept service_role ALL policy for edge functions',
      'Backfilled NULL organization_id from user records'
    ),
    'timestamp', NOW()
  )
);

DO $$
BEGIN
  RAISE NOTICE 'admin_alerts RLS policies updated for organization isolation';
END $$;
