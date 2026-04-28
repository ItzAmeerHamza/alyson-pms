-- Screenshot Deletions audit table + time deduction tracking
-- When a screenshot is deleted (by employee or admin), the corresponding time is deducted

-- 1. Create screenshot_deletions audit table
CREATE TABLE IF NOT EXISTS public.screenshot_deletions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    screenshot_id UUID NOT NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    time_log_id UUID REFERENCES public.time_logs(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    deleted_by UUID NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deducted_seconds INTEGER NOT NULL DEFAULT 0,
    screenshot_captured_at TIMESTAMPTZ NOT NULL,
    image_url TEXT,
    deletion_source TEXT NOT NULL CHECK (deletion_source IN ('desktop_agent', 'web_admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_screenshot_deletions_user_id ON public.screenshot_deletions(user_id);
CREATE INDEX IF NOT EXISTS idx_screenshot_deletions_time_log_id ON public.screenshot_deletions(time_log_id);
CREATE INDEX IF NOT EXISTS idx_screenshot_deletions_deleted_at ON public.screenshot_deletions(deleted_at);
CREATE INDEX IF NOT EXISTS idx_screenshot_deletions_org_id ON public.screenshot_deletions(organization_id);

-- 2. Add deducted_seconds column to time_logs
ALTER TABLE public.time_logs ADD COLUMN IF NOT EXISTS deducted_seconds INTEGER NOT NULL DEFAULT 0;

-- 3. RLS policies for screenshot_deletions
ALTER TABLE public.screenshot_deletions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own deletions"
    ON public.screenshot_deletions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own deletions"
    ON public.screenshot_deletions FOR INSERT
    WITH CHECK (auth.uid() = deleted_by);

CREATE POLICY "Service role full access to screenshot_deletions"
    ON public.screenshot_deletions FOR ALL
    USING (auth.role() = 'service_role');
