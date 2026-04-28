-- Phase 5: Add organization_id to Reports and Notifications Tables
-- Tables: notifications, report_recipients, report_configurations,
--         report_history, tracking_overlay_settings, tracking_status_logs

-- ============================================================================
-- 1. notifications
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    ALTER TABLE public.notifications
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.notifications n
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE n.user_id = u.id AND n.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_notifications_organization_id
      ON public.notifications(organization_id);
    COMMENT ON COLUMN public.notifications.organization_id IS 'Organization this notification belongs to';
  END IF;
END $$;

-- ============================================================================
-- 2. report_recipients
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.report_recipients') IS NOT NULL THEN
    ALTER TABLE public.report_recipients
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.report_recipients rr
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE rr.user_id = u.id AND rr.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_report_recipients_organization_id
      ON public.report_recipients(organization_id);
    COMMENT ON COLUMN public.report_recipients.organization_id IS 'Organization this recipient belongs to';
  END IF;
END $$;

-- ============================================================================
-- 3. report_configurations (no user_id - will need manual org assignment)
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.report_configurations') IS NOT NULL THEN
    ALTER TABLE public.report_configurations
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    CREATE INDEX IF NOT EXISTS idx_report_configurations_organization_id
      ON public.report_configurations(organization_id);
    COMMENT ON COLUMN public.report_configurations.organization_id IS 'Organization this report config belongs to';
  END IF;
END $$;

-- ============================================================================
-- 4. report_history (no user_id - link via report_configurations)
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.report_history') IS NOT NULL THEN
    ALTER TABLE public.report_history
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.report_history rh
    SET organization_id = rc.organization_id
    FROM public.report_configurations rc
    WHERE rh.report_config_id = rc.id AND rh.organization_id IS NULL AND rc.organization_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_report_history_organization_id
      ON public.report_history(organization_id);
    COMMENT ON COLUMN public.report_history.organization_id IS 'Organization this report history belongs to';
  END IF;
END $$;

-- ============================================================================
-- 5. tracking_overlay_settings
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.tracking_overlay_settings') IS NOT NULL THEN
    ALTER TABLE public.tracking_overlay_settings
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.tracking_overlay_settings tos
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE tos.user_id = u.id AND tos.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_tracking_overlay_settings_organization_id
      ON public.tracking_overlay_settings(organization_id);
    COMMENT ON COLUMN public.tracking_overlay_settings.organization_id IS 'Organization this overlay setting belongs to';
  END IF;
END $$;

-- ============================================================================
-- 6. tracking_status_logs
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.tracking_status_logs') IS NOT NULL THEN
    ALTER TABLE public.tracking_status_logs
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
    UPDATE public.tracking_status_logs tsl
    SET organization_id = u.organization_id
    FROM public.users u
    WHERE tsl.user_id = u.id AND tsl.organization_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_tracking_status_logs_organization_id
      ON public.tracking_status_logs(organization_id);
    COMMENT ON COLUMN public.tracking_status_logs.organization_id IS 'Organization this status log belongs to';
  END IF;
END $$;
