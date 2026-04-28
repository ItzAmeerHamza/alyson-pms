-- Fix: Add team_leader role to RLS policies across all relevant tables
-- Team leaders need to see their assigned team members' data
-- for screenshots, reports, time logs, and dashboard features to work.
-- Applied live: March 15, 2026

-- ============================================================================
-- 1. USERS table — team leaders can see their assigned employees
-- ============================================================================
DROP POLICY IF EXISTS "users_select_policy" ON public.users;
DROP POLICY IF EXISTS "users_can_view_self" ON public.users;

CREATE POLICY "users_select_policy" ON public.users
    FOR SELECT USING (
        -- Can view own profile
        id = auth.uid()
        OR
        -- Super admins can see all users
        public.is_super_admin()
        OR
        -- Org admins, admins, and managers can see users in their org
        (
            EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND (is_org_admin = TRUE OR role IN ('admin', 'manager')))
            AND (organization_id = public.get_user_organization_id() OR organization_id IS NULL)
        )
        OR
        -- Team leaders can see their assigned team members
        (
            EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'team_leader')
            AND EXISTS (
                SELECT 1 FROM public.team_leader_assignments
                WHERE team_leader_id = auth.uid() AND employee_id = public.users.id
            )
        )
    );

-- ============================================================================
-- 2. SCREENSHOTS table — team leaders can view their team's screenshots
-- ============================================================================
CREATE POLICY "team_leader_screenshots_select" ON public.screenshots
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'team_leader' AND is_active = true)
        AND EXISTS (
            SELECT 1 FROM public.team_leader_assignments
            WHERE team_leader_id = auth.uid() AND employee_id = screenshots.user_id
        )
    );

-- ============================================================================
-- 3. TIME_LOGS table — team leaders can view their team's time logs
-- ============================================================================
CREATE POLICY "team_leader_time_logs_select" ON public.time_logs
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'team_leader' AND is_active = true)
        AND EXISTS (
            SELECT 1 FROM public.team_leader_assignments
            WHERE team_leader_id = auth.uid() AND employee_id = time_logs.user_id
        )
    );

-- ============================================================================
-- 4. APP_LOGS table — team leaders can view their team's app logs
-- ============================================================================
CREATE POLICY "team_leader_app_logs_select" ON public.app_logs
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'team_leader' AND is_active = true)
        AND EXISTS (
            SELECT 1 FROM public.team_leader_assignments
            WHERE team_leader_id = auth.uid() AND employee_id = app_logs.user_id
        )
    );

-- ============================================================================
-- 5. IDLE_LOGS table — team leaders can view their team's idle logs
-- ============================================================================
CREATE POLICY "team_leader_idle_logs_select" ON public.idle_logs
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'team_leader' AND is_active = true)
        AND EXISTS (
            SELECT 1 FROM public.team_leader_assignments
            WHERE team_leader_id = auth.uid() AND employee_id = idle_logs.user_id
        )
    );
