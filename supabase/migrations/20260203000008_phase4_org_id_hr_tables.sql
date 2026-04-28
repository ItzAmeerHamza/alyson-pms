-- Phase 4: Add organization_id to HR/Warning Tables
-- Tables: employee_warnings, warning_logs, admin_audit_logs

-- ============================================================================
-- 1. employee_warnings
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.employee_warnings') IS NOT NULL THEN
    ALTER TABLE public.employee_warnings
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.employee_warnings ew
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE ew.user_id = u.id AND ew.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_employee_warnings_organization_id
      ON public.employee_warnings(organization_id);
    COMMENT ON COLUMN public.employee_warnings.organization_id IS 'Organization this warning belongs to';
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
-- 3. admin_audit_logs (uses admin_user_id instead of user_id)
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.admin_audit_logs') IS NOT NULL THEN
    ALTER TABLE public.admin_audit_logs
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.admin_audit_logs aal
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE aal.admin_user_id = u.id AND aal.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_organization_id
      ON public.admin_audit_logs(organization_id);
    COMMENT ON COLUMN public.admin_audit_logs.organization_id IS 'Organization this audit log belongs to';
  END IF;
END $$;
