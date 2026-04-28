-- ============================================================================
-- STEP 0: Backfill organization_id on report_configurations
-- ============================================================================
-- The Phase 5 migration added organization_id to report_configurations,
-- report_recipients, and report_history, but existing rows may still have
-- NULL organization_id. This migration backfills them so per-org cron
-- wrappers can find them.
--
-- Safety: This is a data-only migration. It does NOT change any functions,
-- cron jobs, or edge function behavior. It only fills in missing data.
-- ============================================================================

-- 1. Backfill report_configurations from the first active organization
--    (since existing configs were created before multi-tenancy, they belong
--     to the original/default organization)
UPDATE public.report_configurations rc
SET organization_id = (
  SELECT o.id
  FROM public.organizations o
  WHERE o.is_active = true
  ORDER BY o.created_at ASC
  LIMIT 1
)
WHERE rc.organization_id IS NULL;

-- 2. Backfill report_recipients that still have NULL org_id
--    (derive from the user's organization)
UPDATE public.report_recipients rr
SET organization_id = u.organization_id
FROM public.users u
WHERE rr.user_id = u.id
  AND rr.organization_id IS NULL
  AND u.organization_id IS NOT NULL;

-- 3. Backfill report_history that still has NULL org_id
--    (derive from the report_configuration's organization)
UPDATE public.report_history rh
SET organization_id = rc.organization_id
FROM public.report_configurations rc
WHERE rh.report_config_id = rc.id
  AND rh.organization_id IS NULL
  AND rc.organization_id IS NOT NULL;

-- 4. Log the backfill
DO $$
DECLARE
  v_configs_updated INTEGER;
  v_recipients_updated INTEGER;
  v_history_updated INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_configs_updated
  FROM public.report_configurations WHERE organization_id IS NOT NULL;

  SELECT COUNT(*) INTO v_recipients_updated
  FROM public.report_recipients WHERE organization_id IS NOT NULL;

  SELECT COUNT(*) INTO v_history_updated
  FROM public.report_history WHERE organization_id IS NOT NULL;

  RAISE NOTICE 'Backfill complete: % configs, % recipients, % history rows with org_id',
    v_configs_updated, v_recipients_updated, v_history_updated;
END $$;
