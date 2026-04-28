-- Phase 2: Add organization_id to Analytics Tables
-- Tables: employee_insights, employee_comprehensive_analysis, employee_daily_activities,
--         employee_management_insights, ai_employee_insights, ai_user_patterns, activity_stats
-- Skip any table not present in this deployment.

-- ============================================================================
-- 1. employee_insights
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.employee_insights') IS NOT NULL THEN
    ALTER TABLE public.employee_insights
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.employee_insights ei
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE ei.user_id = u.id AND ei.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_employee_insights_organization_id
      ON public.employee_insights(organization_id);
    COMMENT ON COLUMN public.employee_insights.organization_id IS 'Organization this insight belongs to';
  END IF;
END $$;

-- ============================================================================
-- 2. employee_comprehensive_analysis
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.employee_comprehensive_analysis') IS NOT NULL THEN
    ALTER TABLE public.employee_comprehensive_analysis
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.employee_comprehensive_analysis eca
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE eca.user_id = u.id AND eca.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_employee_comprehensive_analysis_organization_id
      ON public.employee_comprehensive_analysis(organization_id);
    COMMENT ON COLUMN public.employee_comprehensive_analysis.organization_id IS 'Organization this analysis belongs to';
  END IF;
END $$;

-- ============================================================================
-- 3. employee_daily_activities
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.employee_daily_activities') IS NOT NULL THEN
    ALTER TABLE public.employee_daily_activities
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.employee_daily_activities eda
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE eda.user_id = u.id AND eda.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_employee_daily_activities_organization_id
      ON public.employee_daily_activities(organization_id);
    COMMENT ON COLUMN public.employee_daily_activities.organization_id IS 'Organization this daily activity belongs to';
  END IF;
END $$;

-- ============================================================================
-- 4. employee_management_insights
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.employee_management_insights') IS NOT NULL THEN
    ALTER TABLE public.employee_management_insights
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.employee_management_insights emi
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE emi.user_id = u.id AND emi.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_employee_management_insights_organization_id
      ON public.employee_management_insights(organization_id);
    COMMENT ON COLUMN public.employee_management_insights.organization_id IS 'Organization this management insight belongs to';
  END IF;
END $$;

-- ============================================================================
-- 5. ai_employee_insights
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.ai_employee_insights') IS NOT NULL THEN
    ALTER TABLE public.ai_employee_insights
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.ai_employee_insights aei
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE aei.user_id = u.id AND aei.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_ai_employee_insights_organization_id
      ON public.ai_employee_insights(organization_id);
    COMMENT ON COLUMN public.ai_employee_insights.organization_id IS 'Organization this AI insight belongs to';
  END IF;
END $$;

-- ============================================================================
-- 6. ai_user_patterns
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.ai_user_patterns') IS NOT NULL THEN
    ALTER TABLE public.ai_user_patterns
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.ai_user_patterns aup
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE aup.user_id = u.id AND aup.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_ai_user_patterns_organization_id
      ON public.ai_user_patterns(organization_id);
    COMMENT ON COLUMN public.ai_user_patterns.organization_id IS 'Organization this user pattern belongs to';
  END IF;
END $$;

-- ============================================================================
-- 7. activity_stats
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.activity_stats') IS NOT NULL THEN
    ALTER TABLE public.activity_stats
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.activity_stats ast
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE ast.user_id = u.id AND ast.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_activity_stats_organization_id
      ON public.activity_stats(organization_id);
    COMMENT ON COLUMN public.activity_stats.organization_id IS 'Organization this activity stat belongs to';
  END IF;
END $$;
