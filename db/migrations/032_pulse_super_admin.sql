-- Platform operator flag for Alyson Pulse.
-- Company admins stay scoped to their workspace; super-admins can list/create
-- companies and operate inside a selected company via X-Pulse-Workspace-Id.
-- Safe to re-run.

ALTER TABLE time_doctor.user_extensions
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN time_doctor.user_extensions.is_super_admin IS
  'Platform operator. Not a workspace role. Promote with UPDATE by email; never grant from company-admin UI.';

-- Promote a platform operator (replace the email):
-- UPDATE time_doctor.user_extensions ext
-- SET is_super_admin = true
-- FROM tenant."user" u
-- WHERE ext.user_id = u.id
--   AND lower(u.email) = 'operator@example.com';
