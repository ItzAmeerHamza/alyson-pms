-- Fix SECURITY DEFINER functions: add SET search_path to prevent schema injection
-- These helpers are used by RLS policies across all tables.

CREATE OR REPLACE FUNCTION public.get_user_organization_id(user_id UUID DEFAULT auth.uid())
RETURNS UUID AS $$
    SELECT organization_id FROM public.users WHERE id = user_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public';

CREATE OR REPLACE FUNCTION public.is_super_admin(user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
    SELECT COALESCE(is_super_admin, FALSE) FROM public.users WHERE id = user_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public';

CREATE OR REPLACE FUNCTION public.is_org_admin(user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
    SELECT COALESCE(is_org_admin, FALSE) FROM public.users WHERE id = user_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public';
