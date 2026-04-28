-- Multi-tenant organizations migration
-- This adds support for multiple companies/organizations

-- ============================================================================
-- STEP 1: Create organizations table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,  -- URL-friendly identifier (e.g., "ebdaadt", "friendco")
    logo_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User columns required by organization RLS policies (must exist before policies reference them)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_org_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON public.users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_is_org_admin ON public.users(is_org_admin);
CREATE INDEX IF NOT EXISTS idx_users_is_super_admin ON public.users(is_super_admin);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_is_active ON public.organizations(is_active);

-- Enable RLS on organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Organizations policies
CREATE POLICY "organizations_select_policy" ON public.organizations
    FOR SELECT USING (
        -- Super admins can see all organizations
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_super_admin = TRUE)
        OR
        -- Users can see their own organization
        id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
        OR
        -- Anyone can check if an org exists by slug (for login validation)
        TRUE
    );

CREATE POLICY "organizations_insert_policy" ON public.organizations
    FOR INSERT WITH CHECK (
        -- Only super admins can create organizations
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_super_admin = TRUE)
    );

CREATE POLICY "organizations_update_policy" ON public.organizations
    FOR UPDATE USING (
        -- Super admins can update any organization
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_super_admin = TRUE)
        OR
        -- Org admins can update their own organization
        (id = (SELECT organization_id FROM public.users WHERE id = auth.uid()) 
         AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_org_admin = TRUE))
    );

CREATE POLICY "organizations_delete_policy" ON public.organizations
    FOR DELETE USING (
        -- Only super admins can delete organizations
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_super_admin = TRUE)
    );

-- ============================================================================
-- STEP 2: Add organization_id to data tables (all NULLABLE for backward compatibility)
-- ============================================================================

-- Time logs
ALTER TABLE public.time_logs ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
CREATE INDEX IF NOT EXISTS idx_time_logs_organization_id ON public.time_logs(organization_id);

-- Screenshots
ALTER TABLE public.screenshots ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
CREATE INDEX IF NOT EXISTS idx_screenshots_organization_id ON public.screenshots(organization_id);

-- App logs
ALTER TABLE public.app_logs ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
CREATE INDEX IF NOT EXISTS idx_app_logs_organization_id ON public.app_logs(organization_id);

-- Idle logs
ALTER TABLE public.idle_logs ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
CREATE INDEX IF NOT EXISTS idx_idle_logs_organization_id ON public.idle_logs(organization_id);

-- Projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON public.projects(organization_id);

-- Tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
CREATE INDEX IF NOT EXISTS idx_tasks_organization_id ON public.tasks(organization_id);

-- ============================================================================
-- STEP 4: Create ebdaadt organization and migrate existing data
-- ============================================================================

-- Create ebdaadt organization (use fixed UUID for consistency)
INSERT INTO public.organizations (id, name, slug, is_active, settings)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Ebdaa Digital Technology',
    'ebdaadt',
    TRUE,
    '{"timezone": "Asia/Qatar"}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- Migrate existing users to ebdaadt
UPDATE public.users 
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

-- Migrate existing time_logs
UPDATE public.time_logs 
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

-- Migrate existing screenshots
UPDATE public.screenshots 
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

-- Migrate existing app_logs
UPDATE public.app_logs 
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

-- Migrate existing idle_logs
UPDATE public.idle_logs 
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

-- Migrate existing projects
UPDATE public.projects 
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

-- Migrate existing tasks
UPDATE public.tasks 
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

-- ============================================================================
-- STEP 5: Create helper function to get user's organization
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_organization_id(user_id UUID DEFAULT auth.uid())
RETURNS UUID AS $$
    SELECT organization_id FROM public.users WHERE id = user_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Function to check if user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin(user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
    SELECT COALESCE(is_super_admin, FALSE) FROM public.users WHERE id = user_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Function to check if user is org admin
CREATE OR REPLACE FUNCTION public.is_org_admin(user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
    SELECT COALESCE(is_org_admin, FALSE) FROM public.users WHERE id = user_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_user_organization_id TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin TO authenticated;

-- ============================================================================
-- STEP 6: Update RLS policies for multi-tenant access with backward compatibility
-- ============================================================================

-- Drop existing policies that need updating
DROP POLICY IF EXISTS "Users can view own time logs" ON public.time_logs;
DROP POLICY IF EXISTS "Users can insert own time logs" ON public.time_logs;
DROP POLICY IF EXISTS "Users can view own app logs" ON public.app_logs;
DROP POLICY IF EXISTS "Users can insert own app logs" ON public.app_logs;
DROP POLICY IF EXISTS "Users can view own screenshots" ON public.screenshots;
DROP POLICY IF EXISTS "Users can insert own screenshots" ON public.screenshots;

-- Time logs policies (with backward compatibility for NULL org_id)
CREATE POLICY "time_logs_select_policy" ON public.time_logs
    FOR SELECT USING (
        -- Super admins can see all
        public.is_super_admin()
        OR
        -- Users can see their own org's data (or legacy NULL data)
        (organization_id = public.get_user_organization_id() OR organization_id IS NULL)
        OR
        -- Users can always see their own data
        user_id = auth.uid()
    );

CREATE POLICY "time_logs_insert_policy" ON public.time_logs
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
    );

CREATE POLICY "time_logs_update_policy" ON public.time_logs
    FOR UPDATE USING (
        user_id = auth.uid()
        OR public.is_super_admin()
        OR (
            public.is_org_admin() 
            AND (organization_id = public.get_user_organization_id() OR organization_id IS NULL)
        )
    );

-- App logs policies
CREATE POLICY "app_logs_select_policy" ON public.app_logs
    FOR SELECT USING (
        public.is_super_admin()
        OR (organization_id = public.get_user_organization_id() OR organization_id IS NULL)
        OR user_id = auth.uid()
    );

CREATE POLICY "app_logs_insert_policy" ON public.app_logs
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
    );

-- Screenshots policies  
CREATE POLICY "screenshots_select_policy" ON public.screenshots
    FOR SELECT USING (
        public.is_super_admin()
        OR (organization_id = public.get_user_organization_id() OR organization_id IS NULL)
        OR user_id = auth.uid()
    );

CREATE POLICY "screenshots_insert_policy" ON public.screenshots
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
    );

-- Idle logs policies (may have RLS disabled, add policies anyway)
CREATE POLICY "idle_logs_select_policy" ON public.idle_logs
    FOR SELECT USING (
        public.is_super_admin()
        OR (organization_id = public.get_user_organization_id() OR organization_id IS NULL)
        OR user_id = auth.uid()
    );

CREATE POLICY "idle_logs_insert_policy" ON public.idle_logs
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
    );

-- Projects policies - update to include org filter
DROP POLICY IF EXISTS "projects_policy" ON public.projects;
DROP POLICY IF EXISTS "Users can view projects" ON public.projects;

CREATE POLICY "projects_select_policy" ON public.projects
    FOR SELECT USING (
        public.is_super_admin()
        OR (organization_id = public.get_user_organization_id() OR organization_id IS NULL)
    );

CREATE POLICY "projects_insert_policy" ON public.projects
    FOR INSERT WITH CHECK (
        public.is_super_admin()
        OR public.is_org_admin()
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "projects_update_policy" ON public.projects
    FOR UPDATE USING (
        public.is_super_admin()
        OR (
            (public.is_org_admin() OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'manager')))
            AND (organization_id = public.get_user_organization_id() OR organization_id IS NULL)
        )
    );

CREATE POLICY "projects_delete_policy" ON public.projects
    FOR DELETE USING (
        public.is_super_admin()
        OR (
            (public.is_org_admin() OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'))
            AND (organization_id = public.get_user_organization_id() OR organization_id IS NULL)
        )
    );

-- Tasks policies
DROP POLICY IF EXISTS "Users can view tasks" ON public.tasks;

CREATE POLICY "tasks_select_policy" ON public.tasks
    FOR SELECT USING (
        public.is_super_admin()
        OR (organization_id = public.get_user_organization_id() OR organization_id IS NULL)
    );

CREATE POLICY "tasks_insert_policy" ON public.tasks
    FOR INSERT WITH CHECK (
        public.is_super_admin()
        OR public.is_org_admin()
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "tasks_update_policy" ON public.tasks
    FOR UPDATE USING (
        public.is_super_admin()
        OR (
            (public.is_org_admin() OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'manager')))
            AND (organization_id = public.get_user_organization_id() OR organization_id IS NULL)
        )
    );

-- Update users policies to include org context
DROP POLICY IF EXISTS "users_select_policy" ON public.users;
DROP POLICY IF EXISTS "users_update_policy" ON public.users;
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

CREATE POLICY "users_select_policy" ON public.users
    FOR SELECT USING (
        -- Can view own profile
        id = auth.uid()
        OR
        -- Super admins can see all users
        public.is_super_admin()
        OR
        -- Org admins and managers can see users in their org
        (
            EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND (is_org_admin = TRUE OR role IN ('admin', 'manager')))
            AND (organization_id = public.get_user_organization_id() OR organization_id IS NULL)
        )
    );

CREATE POLICY "users_update_policy" ON public.users
    FOR UPDATE USING (
        -- Can update own profile
        id = auth.uid()
        OR
        -- Super admins can update any user
        public.is_super_admin()
        OR
        -- Org admins can update users in their org
        (
            public.is_org_admin()
            AND (organization_id = public.get_user_organization_id() OR organization_id IS NULL)
        )
    )
    WITH CHECK (
        id = auth.uid()
        OR public.is_super_admin()
        OR (
            public.is_org_admin()
            AND (organization_id = public.get_user_organization_id() OR organization_id IS NULL)
        )
    );

-- ============================================================================
-- STEP 7: Create function to validate organization on login
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_user_organization(
    user_email TEXT,
    org_slug TEXT
) RETURNS TABLE (
    user_id UUID,
    organization_id UUID,
    organization_name TEXT,
    is_valid BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id as user_id,
        o.id as organization_id,
        o.name as organization_name,
        (u.id IS NOT NULL AND o.id IS NOT NULL AND o.is_active = TRUE) as is_valid
    FROM public.organizations o
    LEFT JOIN public.users u ON u.organization_id = o.id AND u.email = user_email
    WHERE o.slug = org_slug;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get organization by slug (for login page validation)
CREATE OR REPLACE FUNCTION public.get_organization_by_slug(org_slug TEXT)
RETURNS TABLE (
    id UUID,
    name TEXT,
    slug TEXT,
    logo_url TEXT,
    is_active BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT o.id, o.name, o.slug, o.logo_url, o.is_active
    FROM public.organizations o
    WHERE o.slug = org_slug;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.validate_user_organization TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_by_slug TO anon, authenticated;

-- ============================================================================
-- STEP 8: Add trigger to auto-set organization_id on new records
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_organization_id()
RETURNS TRIGGER AS $$
BEGIN
    -- If organization_id is not set, get it from the user's profile
    IF NEW.organization_id IS NULL AND NEW.user_id IS NOT NULL THEN
        SELECT organization_id INTO NEW.organization_id
        FROM public.users
        WHERE id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers for auto-setting organization_id
DROP TRIGGER IF EXISTS set_time_logs_org_id ON public.time_logs;
CREATE TRIGGER set_time_logs_org_id
    BEFORE INSERT ON public.time_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.set_organization_id();

DROP TRIGGER IF EXISTS set_screenshots_org_id ON public.screenshots;
CREATE TRIGGER set_screenshots_org_id
    BEFORE INSERT ON public.screenshots
    FOR EACH ROW
    EXECUTE FUNCTION public.set_organization_id();

DROP TRIGGER IF EXISTS set_app_logs_org_id ON public.app_logs;
CREATE TRIGGER set_app_logs_org_id
    BEFORE INSERT ON public.app_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.set_organization_id();

DROP TRIGGER IF EXISTS set_idle_logs_org_id ON public.idle_logs;
CREATE TRIGGER set_idle_logs_org_id
    BEFORE INSERT ON public.idle_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.set_organization_id();

-- ============================================================================
-- STEP 9: Comments for documentation
-- ============================================================================

COMMENT ON TABLE public.organizations IS 'Multi-tenant organizations/companies';
COMMENT ON COLUMN public.organizations.slug IS 'URL-friendly unique identifier for login';
COMMENT ON COLUMN public.organizations.settings IS 'JSON settings for the organization (timezone, etc.)';

COMMENT ON COLUMN public.users.organization_id IS 'The organization this user belongs to';
COMMENT ON COLUMN public.users.is_org_admin IS 'Whether user can manage their organization';
COMMENT ON COLUMN public.users.is_super_admin IS 'Whether user can manage all organizations';
