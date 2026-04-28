-- ============================================================================
-- TIGHTEN INSERT RLS POLICIES
-- Date: 2026-02-14
-- Purpose: Require auth.uid() = user_id instead of just user_id IS NOT NULL
--          This prevents any authenticated user from inserting rows for other users.
--          Old agents using service_role are NOT affected (service_role bypasses RLS).
-- ============================================================================
-- ROLLBACK SQL (if needed):
--   DROP POLICY IF EXISTS "Allow authenticated activity logging" ON app_logs;
--   CREATE POLICY "Allow authenticated activity logging" ON app_logs FOR INSERT TO authenticated WITH CHECK (user_id IS NOT NULL);
--   DROP POLICY IF EXISTS "Allow authenticated idle logging" ON idle_logs;
--   CREATE POLICY "Allow authenticated idle logging" ON idle_logs FOR INSERT TO authenticated WITH CHECK (user_id IS NOT NULL);
--   DROP POLICY IF EXISTS "desktop_agent_uploads" ON screenshots;
--   CREATE POLICY "desktop_agent_uploads" ON screenshots FOR INSERT TO public WITH CHECK ((user_id IS NOT NULL) AND ((user_id)::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text));
--   CREATE POLICY "Allow authenticated time logging" ON time_logs FOR INSERT TO authenticated WITH CHECK (user_id IS NOT NULL);
-- ============================================================================

-- 1. app_logs: tighten INSERT
DROP POLICY IF EXISTS "Allow authenticated activity logging" ON app_logs;
CREATE POLICY "Allow authenticated activity logging" ON app_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 2. idle_logs: tighten INSERT
DROP POLICY IF EXISTS "Allow authenticated idle logging" ON idle_logs;
CREATE POLICY "Allow authenticated idle logging" ON idle_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 3. screenshots: tighten INSERT (also change role from public to authenticated)
DROP POLICY IF EXISTS "desktop_agent_uploads" ON screenshots;
CREATE POLICY "desktop_agent_uploads" ON screenshots
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 4. time_logs: drop weak duplicate policy (keep the strong one)
--    "authenticated_user_own_time_logs_insert" already has auth.uid() = user_id
DROP POLICY IF EXISTS "Allow authenticated time logging" ON time_logs;
