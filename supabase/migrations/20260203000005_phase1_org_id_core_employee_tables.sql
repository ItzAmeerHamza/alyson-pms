-- Phase 1: Add organization_id to Core Employee Tables
-- Tables: employee_salary_settings, employee_payroll, employee_deductions,
--         employee_working_standards, employee_project_assignments
-- Some tables may not exist in all deployments; skip when missing.

-- ============================================================================
-- 1. employee_salary_settings
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.employee_salary_settings') IS NOT NULL THEN
    ALTER TABLE public.employee_salary_settings
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.employee_salary_settings ess
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE ess.user_id = u.id AND ess.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_employee_salary_settings_organization_id
      ON public.employee_salary_settings(organization_id);
    COMMENT ON COLUMN public.employee_salary_settings.organization_id IS 'Organization this salary setting belongs to';
  END IF;
END $$;

-- ============================================================================
-- 2. employee_payroll
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.employee_payroll') IS NOT NULL THEN
    ALTER TABLE public.employee_payroll
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.employee_payroll ep
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE ep.user_id = u.id AND ep.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_employee_payroll_organization_id
      ON public.employee_payroll(organization_id);
    COMMENT ON COLUMN public.employee_payroll.organization_id IS 'Organization this payroll record belongs to';
  END IF;
END $$;

-- ============================================================================
-- 3. employee_deductions
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.employee_deductions') IS NOT NULL THEN
    ALTER TABLE public.employee_deductions
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.employee_deductions ed
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE ed.user_id = u.id AND ed.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_employee_deductions_organization_id
      ON public.employee_deductions(organization_id);
    COMMENT ON COLUMN public.employee_deductions.organization_id IS 'Organization this deduction belongs to';
  END IF;
END $$;

-- ============================================================================
-- 4. employee_working_standards
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.employee_working_standards') IS NOT NULL THEN
    ALTER TABLE public.employee_working_standards
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.employee_working_standards ews
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE ews.user_id = u.id AND ews.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_employee_working_standards_organization_id
      ON public.employee_working_standards(organization_id);
    COMMENT ON COLUMN public.employee_working_standards.organization_id IS 'Organization this working standard belongs to';
  END IF;
END $$;

-- ============================================================================
-- 5. employee_project_assignments
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.employee_project_assignments') IS NOT NULL THEN
    ALTER TABLE public.employee_project_assignments
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.employee_project_assignments epa
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE epa.user_id = u.id AND epa.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_employee_project_assignments_organization_id
      ON public.employee_project_assignments(organization_id);
    COMMENT ON COLUMN public.employee_project_assignments.organization_id IS 'Organization this assignment belongs to';
  END IF;
END $$;
