-- Additive migration for existing TimeFlow RDS → Alyson Pulse
-- Safe to run on a live database; does not drop AI/legacy tables.

-- Cognito link
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS cognito_sub TEXT UNIQUE;

-- Team management columns
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS location TEXT;

CREATE INDEX IF NOT EXISTS idx_users_manager ON public.users(manager_id);

-- Allow team_leader role (drop old check if present, re-add)
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'manager', 'team_leader', 'employee'));

-- Org-level settings for Loveable thresholds
CREATE TABLE IF NOT EXISTS public.org_settings (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  settings        JSONB NOT NULL DEFAULT '{
    "hours_threshold": 7,
    "high_activity_threshold": 60,
    "low_activity_threshold": 30,
    "screenshot_interval_minutes": 10
  }'::jsonb,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Low-hours email send history
CREATE TABLE IF NOT EXISTS public.low_hours_email_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  employee_email   TEXT NOT NULL,
  manager_email    TEXT,
  work_date        DATE NOT NULL,
  hours_worked     NUMERIC(5,2) NOT NULL,
  hours_threshold  NUMERIC(4,2) NOT NULL,
  sent_by          UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'sent',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_low_hours_log_org_date
  ON public.low_hours_email_log(organization_id, work_date DESC);

-- S3 key on screenshots if missing (agent upload path)
ALTER TABLE public.screenshots ADD COLUMN IF NOT EXISTS s3_key TEXT;

-- Backfill manager_id from team_leader_assignments (one lead per employee)
UPDATE public.users u
SET manager_id = tla.team_leader_id
FROM public.team_leader_assignments tla
WHERE u.id = tla.employee_id
  AND u.manager_id IS NULL;

-- Seed org_settings for existing orgs
INSERT INTO public.org_settings (organization_id)
SELECT o.id FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.org_settings s WHERE s.organization_id = o.id
);
