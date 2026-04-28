-- Add organization_id column to user_invites table
-- This allows invite links to be scoped to a specific organization

-- Add organization_id column
ALTER TABLE public.user_invites
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

-- Create index for organization lookups
CREATE INDEX IF NOT EXISTS idx_user_invites_organization_id ON public.user_invites(organization_id);

-- Update RLS policies to be organization-aware
-- Drop existing policies first
DROP POLICY IF EXISTS "Admins can view all invites" ON public.user_invites;
DROP POLICY IF EXISTS "Admins can create invites" ON public.user_invites;
DROP POLICY IF EXISTS "Admins can update invites" ON public.user_invites;
DROP POLICY IF EXISTS "Admins can delete invites" ON public.user_invites;

-- Recreate policies with organization awareness
-- Admins can view invites in their organization
CREATE POLICY "Admins can view organization invites" ON public.user_invites
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role = 'admin'
      AND (
        u.is_super_admin = true
        OR user_invites.organization_id IS NULL
        OR u.organization_id = user_invites.organization_id
      )
    )
  );

-- Only admins can create invites for their organization
CREATE POLICY "Admins can create organization invites" ON public.user_invites
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role = 'admin'
      AND (
        u.is_super_admin = true
        OR organization_id IS NULL
        OR u.organization_id = organization_id
      )
    )
  );

-- Admins can update invites in their organization
CREATE POLICY "Admins can update organization invites" ON public.user_invites
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role = 'admin'
      AND (
        u.is_super_admin = true
        OR user_invites.organization_id IS NULL
        OR u.organization_id = user_invites.organization_id
      )
    )
  );

-- Admins can delete invites in their organization
CREATE POLICY "Admins can delete organization invites" ON public.user_invites
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role = 'admin'
      AND (
        u.is_super_admin = true
        OR user_invites.organization_id IS NULL
        OR u.organization_id = user_invites.organization_id
      )
    )
  );

-- Add comment
COMMENT ON COLUMN public.user_invites.organization_id IS 'Organization this invite belongs to';
