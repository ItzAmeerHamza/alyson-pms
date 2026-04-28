-- Phase 6: Add organization_id to Remaining Tables
-- Tables: activities, warning_logs, notification_log,
--         employee_behavioral_patterns, employee_analysis_requests

-- ============================================================================
-- 1. activities
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.activities') IS NOT NULL THEN
    ALTER TABLE public.activities
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.activities a
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE a.user_id = u.id AND a.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_activities_organization_id
      ON public.activities(organization_id);
    COMMENT ON COLUMN public.activities.organization_id IS 'Organization this activity belongs to';
  END IF;
END $$;

-- ============================================================================
-- 2. warning_logs
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.warning_logs') IS NOT NULL THEN
    ALTER TABLE public.warning_logs
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.warning_logs wl
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE wl.user_id = u.id AND wl.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_warning_logs_organization_id
      ON public.warning_logs(organization_id);
    COMMENT ON COLUMN public.warning_logs.organization_id IS 'Organization this warning log belongs to';
  END IF;
END $$;

-- ============================================================================
-- 3. notification_log
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.notification_log') IS NOT NULL THEN
    ALTER TABLE public.notification_log
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.notification_log nl
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE nl.recipient_id = u.id AND nl.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_notification_log_organization_id
      ON public.notification_log(organization_id);
    COMMENT ON COLUMN public.notification_log.organization_id IS 'Organization this notification belongs to';
  END IF;
END $$;

-- ============================================================================
-- 4. employee_behavioral_patterns
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.employee_behavioral_patterns') IS NOT NULL THEN
    ALTER TABLE public.employee_behavioral_patterns
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.employee_behavioral_patterns ebp
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE ebp.user_id = u.id AND ebp.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_employee_behavioral_patterns_organization_id
      ON public.employee_behavioral_patterns(organization_id);
    COMMENT ON COLUMN public.employee_behavioral_patterns.organization_id IS 'Organization this behavioral pattern belongs to';
  END IF;
END $$;

-- ============================================================================
-- 5. employee_analysis_requests
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.employee_analysis_requests') IS NOT NULL THEN
    ALTER TABLE public.employee_analysis_requests
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.employee_analysis_requests ear
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE ear.user_id = u.id AND ear.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_employee_analysis_requests_organization_id
      ON public.employee_analysis_requests(organization_id);
    COMMENT ON COLUMN public.employee_analysis_requests.organization_id IS 'Organization this analysis request belongs to';
  END IF;
END $$;

-- ============================================================================
-- Update RLS policies (only for tables that exist)
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.activities') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Users can view own activities" ON public.activities;
    CREATE POLICY "Users can view own activities" ON public.activities
      FOR SELECT USING (
        auth.uid() = user_id
        OR public.is_super_admin(auth.uid())
        OR (organization_id = public.get_user_organization_id(auth.uid()))
      );
    DROP POLICY IF EXISTS "Users can insert own activities" ON public.activities;
    CREATE POLICY "Users can insert own activities" ON public.activities
      FOR INSERT WITH CHECK (
        auth.uid() = user_id
        OR public.is_super_admin(auth.uid())
      );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.warning_logs') IS NOT NULL THEN
    ALTER TABLE public.warning_logs ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "warning_logs_select_policy" ON public.warning_logs;
    CREATE POLICY "warning_logs_select_policy" ON public.warning_logs
      FOR SELECT USING (
        auth.uid() = user_id
        OR public.is_super_admin(auth.uid())
        OR (organization_id = public.get_user_organization_id(auth.uid()))
      );
    DROP POLICY IF EXISTS "warning_logs_insert_policy" ON public.warning_logs;
    CREATE POLICY "warning_logs_insert_policy" ON public.warning_logs
      FOR INSERT WITH CHECK (
        public.is_super_admin(auth.uid())
        OR (organization_id = public.get_user_organization_id(auth.uid()))
      );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.notification_log') IS NOT NULL THEN
    DROP POLICY IF EXISTS "notification_log_select_policy" ON public.notification_log;
    CREATE POLICY "notification_log_select_policy" ON public.notification_log
      FOR SELECT USING (
        public.is_super_admin(auth.uid())
        OR (organization_id = public.get_user_organization_id(auth.uid()))
        OR (recipient_id = auth.uid())
      );
    DROP POLICY IF EXISTS "notification_log_insert_policy" ON public.notification_log;
    CREATE POLICY "notification_log_insert_policy" ON public.notification_log
      FOR INSERT WITH CHECK (
        public.is_super_admin(auth.uid())
        OR (organization_id = public.get_user_organization_id(auth.uid()))
      );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.employee_behavioral_patterns') IS NOT NULL THEN
    DROP POLICY IF EXISTS "employee_behavioral_patterns_select_policy" ON public.employee_behavioral_patterns;
    CREATE POLICY "employee_behavioral_patterns_select_policy" ON public.employee_behavioral_patterns
      FOR SELECT USING (
        auth.uid() = user_id
        OR public.is_super_admin(auth.uid())
        OR (organization_id = public.get_user_organization_id(auth.uid()))
      );
    DROP POLICY IF EXISTS "employee_behavioral_patterns_insert_policy" ON public.employee_behavioral_patterns;
    CREATE POLICY "employee_behavioral_patterns_insert_policy" ON public.employee_behavioral_patterns
      FOR INSERT WITH CHECK (
        public.is_super_admin(auth.uid())
        OR (organization_id = public.get_user_organization_id(auth.uid()))
      );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.employee_analysis_requests') IS NOT NULL THEN
    DROP POLICY IF EXISTS "employee_analysis_requests_select_policy" ON public.employee_analysis_requests;
    CREATE POLICY "employee_analysis_requests_select_policy" ON public.employee_analysis_requests
      FOR SELECT USING (
        auth.uid() = user_id
        OR auth.uid() = requested_by
        OR public.is_super_admin(auth.uid())
        OR (organization_id = public.get_user_organization_id(auth.uid()))
      );
    DROP POLICY IF EXISTS "employee_analysis_requests_insert_policy" ON public.employee_analysis_requests;
    CREATE POLICY "employee_analysis_requests_insert_policy" ON public.employee_analysis_requests
      FOR INSERT WITH CHECK (
        public.is_super_admin(auth.uid())
        OR (organization_id = public.get_user_organization_id(auth.uid()))
      );
  END IF;
END $$;
