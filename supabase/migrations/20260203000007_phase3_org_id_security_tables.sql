-- Phase 3: Add organization_id to Security Tables
-- Tables: admin_alerts, fraud_alerts, suspicious_activity,
--         suspicious_activity_detection, employee_suspicious_activity, unusual_activity

-- ============================================================================
-- 1. admin_alerts
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.admin_alerts') IS NOT NULL THEN
    ALTER TABLE public.admin_alerts
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.admin_alerts aa
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE aa.user_id = u.id AND aa.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_admin_alerts_organization_id
      ON public.admin_alerts(organization_id);
    COMMENT ON COLUMN public.admin_alerts.organization_id IS 'Organization this alert belongs to';
  END IF;
END $$;

-- ============================================================================
-- 2. fraud_alerts
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.fraud_alerts') IS NOT NULL THEN
    ALTER TABLE public.fraud_alerts
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.fraud_alerts fa
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE fa.user_id = u.id AND fa.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_fraud_alerts_organization_id
      ON public.fraud_alerts(organization_id);
    COMMENT ON COLUMN public.fraud_alerts.organization_id IS 'Organization this fraud alert belongs to';
  END IF;
END $$;

-- ============================================================================
-- 3. suspicious_activity
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.suspicious_activity') IS NOT NULL THEN
    ALTER TABLE public.suspicious_activity
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.suspicious_activity sa
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE sa.user_id = u.id AND sa.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_suspicious_activity_organization_id
      ON public.suspicious_activity(organization_id);
    COMMENT ON COLUMN public.suspicious_activity.organization_id IS 'Organization this suspicious activity belongs to';
  END IF;
END $$;

-- ============================================================================
-- 4. suspicious_activity_detection
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.suspicious_activity_detection') IS NOT NULL THEN
    ALTER TABLE public.suspicious_activity_detection
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.suspicious_activity_detection sad
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE sad.user_id = u.id AND sad.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_suspicious_activity_detection_organization_id
      ON public.suspicious_activity_detection(organization_id);
    COMMENT ON COLUMN public.suspicious_activity_detection.organization_id IS 'Organization this detection belongs to';
  END IF;
END $$;

-- ============================================================================
-- 5. employee_suspicious_activity
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.employee_suspicious_activity') IS NOT NULL THEN
    ALTER TABLE public.employee_suspicious_activity
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.employee_suspicious_activity esa
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE esa.user_id = u.id AND esa.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_employee_suspicious_activity_organization_id
      ON public.employee_suspicious_activity(organization_id);
    COMMENT ON COLUMN public.employee_suspicious_activity.organization_id IS 'Organization this employee suspicious activity belongs to';
  END IF;
END $$;

-- ============================================================================
-- 6. unusual_activity
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.unusual_activity') IS NOT NULL THEN
    ALTER TABLE public.unusual_activity
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.unusual_activity ua
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE ua.user_id = u.id AND ua.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_unusual_activity_organization_id
      ON public.unusual_activity(organization_id);
    COMMENT ON COLUMN public.unusual_activity.organization_id IS 'Organization this unusual activity belongs to';
  END IF;
END $$;
