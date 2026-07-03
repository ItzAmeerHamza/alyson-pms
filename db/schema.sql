-- Alyson Pulse — minimal RDS schema (greenfield install)
-- Screenshot images live in S3; this DB stores metadata only.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Organizations (optional multi-tenant; use a single row for one company)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  logo_url    TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

-- ---------------------------------------------------------------------------
-- Users (Cognito sub stored as id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id              UUID PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  full_name       TEXT,
  role            TEXT NOT NULL DEFAULT 'employee'
                    CHECK (role IN ('admin', 'manager', 'team_leader', 'employee')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  manager_id      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  department      TEXT,
  location        TEXT,
  avatar_url      TEXT,
  cognito_sub     TEXT UNIQUE,
  last_activity   TIMESTAMPTZ DEFAULT NOW(),
  paused_at       TIMESTAMPTZ,
  paused_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  pause_reason    TEXT,
  is_org_admin    BOOLEAN NOT NULL DEFAULT false,
  is_super_admin  BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_org ON public.users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_manager ON public.users(manager_id);

-- ---------------------------------------------------------------------------
-- Projects & assignments (time tracker)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.employee_project_assignments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, project_id)
);

-- ---------------------------------------------------------------------------
-- Time tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.time_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  project_id       UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  start_time       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time         TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'paused', 'completed', 'auto_closed')),
  idle_seconds     INTEGER NOT NULL DEFAULT 0,
  deducted_seconds INTEGER NOT NULL DEFAULT 0,
  device_id        TEXT,
  organization_id  UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_logs_user_start ON public.time_logs(user_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_time_logs_org ON public.time_logs(organization_id);

-- ---------------------------------------------------------------------------
-- Screenshots (metadata; binary in S3)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.screenshots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  time_log_id      UUID REFERENCES public.time_logs(id) ON DELETE SET NULL,
  s3_key           TEXT,
  file_path        TEXT NOT NULL DEFAULT '',
  file_size        INTEGER,
  image_url        TEXT,
  captured_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activity_percent INTEGER NOT NULL DEFAULT 0,
  focus_percent    INTEGER NOT NULL DEFAULT 0,
  mouse_clicks     INTEGER NOT NULL DEFAULT 0,
  keystrokes       INTEGER NOT NULL DEFAULT 0,
  mouse_movements  INTEGER NOT NULL DEFAULT 0,
  app_name         TEXT,
  window_title     TEXT,
  agent_version    TEXT,
  organization_id  UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_screenshots_user_captured ON public.screenshots(user_id, captured_at DESC);

-- ---------------------------------------------------------------------------
-- App & URL activity (employee detail page)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  time_log_id     UUID REFERENCES public.time_logs(id) ON DELETE SET NULL,
  app_name        TEXT,
  window_title    TEXT,
  started_at      TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  timestamp       TIMESTAMPTZ DEFAULT NOW(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_logs_user_started ON public.app_logs(user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.app_url_activity (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  time_log_id     UUID REFERENCES public.time_logs(id) ON DELETE SET NULL,
  site_url        TEXT NOT NULL,
  title           TEXT,
  domain          TEXT,
  browser         TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_url_activity_user_started ON public.app_url_activity(user_id, started_at DESC);

-- ---------------------------------------------------------------------------
-- Idle periods (optional — employee detail)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.idle_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  time_log_id      UUID REFERENCES public.time_logs(id) ON DELETE SET NULL,
  project_id       UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  idle_start       TIMESTAMPTZ NOT NULL,
  idle_end         TIMESTAMPTZ,
  duration_seconds INTEGER,
  organization_id  UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Low-hours email history (replaces Loveable localStorage)
-- ---------------------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_low_hours_log_org_date ON public.low_hours_email_log(organization_id, work_date DESC);

-- ---------------------------------------------------------------------------
-- Helpful view for dashboard aggregates
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.daily_activity_summary
WITH (security_invoker = on) AS
SELECT
  tl.user_id,
  DATE(tl.start_time AT TIME ZONE 'UTC') AS activity_date,
  COUNT(*) AS sessions_count,
  SUM(EXTRACT(EPOCH FROM (COALESCE(tl.end_time, NOW()) - tl.start_time))) AS total_seconds,
  SUM(tl.idle_seconds) AS total_idle_seconds,
  AVG(s.activity_percent) AS avg_activity_percent,
  COUNT(s.id) AS screenshots_count
FROM public.time_logs tl
LEFT JOIN public.screenshots s ON s.time_log_id = tl.id
WHERE tl.start_time IS NOT NULL
GROUP BY tl.user_id, DATE(tl.start_time AT TIME ZONE 'UTC');
